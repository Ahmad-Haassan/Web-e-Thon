import { NextRequest } from "next/server";
import {
  assertExamOwnership,
  handleRouteError,
  HttpError,
  jsonOk,
  requireAuth,
  requireRole,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { recomputeAttemptGrading } from "@/lib/server/grading";
import { verifyAnswerChain } from "@/lib/server/chain";
import { logAudit } from "@/lib/server/audit";
import { resolveDisputeSchema, uuidSchema } from "@/lib/shared/schemas";
import type { ServerPaperSnapshot } from "@/lib/shared/types";

export const runtime = "nodejs";

/**
 * Dispute detail with full Evidence Timeline (Innovation 5.4):
 * Chronological merge of answer saves (with accepted/rejected & receipt), disconnects/reconnects,
 * integrity flags, lock/unlock events, candidate's answer, and (for examiner) the answer key.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(req);
    const { id: disputeId } = await context.params;
    if (!uuidSchema.safeParse(disputeId).success) throw new HttpError(400, "Invalid dispute ID");

    const supabase = getServiceSupabase();
    const { data: dispute } = await supabase
      .from("disputes")
      .select("*, attempts(*, exams(id, owner_id, title), users(id, name, email))")
      .eq("id", disputeId)
      .maybeSingle();

    if (!dispute) throw new HttpError(404, "Dispute not found");

    const attempt = (Array.isArray(dispute.attempts) ? dispute.attempts[0] : dispute.attempts) as {
      id: string;
      exam_id: string;
      candidate_id: string;
      paper_snapshot: ServerPaperSnapshot;
      exams: { id: string; owner_id: string; title: string } | { id: string; owner_id: string; title: string }[];
      users: { id: string; name: string; email: string };
    };
    const exam = Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams;

    if (user.role === "CANDIDATE") {
      if (attempt.candidate_id !== user.id) throw new HttpError(403, "Forbidden");
    } else {
      assertExamOwnership(user, exam);
    }

    const [{ data: answers }, { data: events }, { data: lockEvents }, { data: receipts }] =
      await Promise.all([
        supabase
          .from("answers")
          .select("*")
          .eq("attempt_id", attempt.id)
          .order("client_seq", { ascending: true }),
        supabase
          .from("events")
          .select("*")
          .eq("attempt_id", attempt.id)
          .order("at", { ascending: true }),
        supabase
          .from("lock_events")
          .select("*")
          .eq("attempt_id", attempt.id)
          .order("at", { ascending: true }),
        supabase
          .from("receipts")
          .select("*")
          .eq("attempt_id", attempt.id)
          .order("client_seq", { ascending: true }),
      ]);

    const timeline = [
      ...(answers ?? []).map((a) => ({
        at: a.received_at,
        kind: "ANSWER_SYNC",
        questionId: a.question_id,
        clientSeq: a.client_seq,
        accepted: a.accepted,
        rejectReason: a.reject_reason,
        hash: a.hash,
      })),
      ...(events ?? []).map((e) => ({
        at: e.at,
        kind: "EVENT",
        type: e.type,
        meta: e.meta,
        hash: e.hash,
      })),
      ...(lockEvents ?? []).map((l) => ({
        at: l.at,
        kind: "LOCK_EVENT",
        type: l.type,
        actorId: l.actor_id,
        meta: l.meta,
        hash: l.hash,
      })),
    ].sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());

    const chain = verifyAnswerChain(
      (answers ?? []).map((a) => ({
        attemptId: a.attempt_id,
        questionId: a.question_id,
        selected: a.selected,
        marked: a.marked,
        clientSeq: a.client_seq,
        receivedAt: a.received_at,
        accepted: a.accepted,
        prevHash: a.prev_hash,
        hash: a.hash,
        receiptSig: a.receipt_sig,
      }))
    );

    const disputedQuestion = dispute.question_id
      ? attempt.paper_snapshot.questions.find((q) => q.id === dispute.question_id) ?? null
      : null;

    const candidateLatestAnswer = dispute.question_id
      ? [...(answers ?? [])]
          .reverse()
          .find((a) => a.question_id === dispute.question_id && a.accepted) ?? null
      : null;

    return jsonOk({
      dispute: {
        id: dispute.id,
        attemptId: dispute.attempt_id,
        questionId: dispute.question_id,
        type: dispute.type,
        reason: dispute.reason,
        status: dispute.status,
        resolution: dispute.resolution,
        resolverId: dispute.resolver_id,
        createdAt: dispute.created_at,
        resolvedAt: dispute.resolved_at,
      },
      candidate: attempt.users,
      examTitle: exam.title,
      question: disputedQuestion
        ? {
            id: disputedQuestion.id,
            text: disputedQuestion.text,
            type: disputedQuestion.type,
            marks: disputedQuestion.marks,
            options: disputedQuestion.options,
            correctOptionIds: disputedQuestion.correctOptionIds,
            explanation: disputedQuestion.explanation,
          }
        : null,
      candidateAnswer: candidateLatestAnswer?.selected ?? null,
      evidenceTimeline: timeline,
      receipts: receipts ?? [],
      chain,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * Resolve a dispute (Innovation 5.4):
 * - REJECTED: records reason, no score change
 * - REGRADED: updates candidate's awarded marks for disputed question and recomputes score
 * - AMBIGUOUS_ACCEPTED: awards full marks for that question to EVERY real candidate who got it in this exam!
 * - TECHNICAL_REMEDY: logs technical resolution in AuditLog
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const examiner = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const { id: disputeId } = await context.params;
    if (!uuidSchema.safeParse(disputeId).success) throw new HttpError(400, "Invalid dispute ID");

    const body = await req.json();
    const parsed = resolveDisputeSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid resolution payload", parsed.error.flatten());
    }

    const supabase = getServiceSupabase();
    const { data: dispute } = await supabase
      .from("disputes")
      .select("*, attempts(id, exam_id, paper_snapshot, exams(owner_id))")
      .eq("id", disputeId)
      .maybeSingle();

    if (!dispute) throw new HttpError(404, "Dispute not found");

    const attempt = (Array.isArray(dispute.attempts) ? dispute.attempts[0] : dispute.attempts) as {
      id: string;
      exam_id: string;
      paper_snapshot: ServerPaperSnapshot;
      exams: { owner_id: string } | { owner_id: string }[];
    };
    const exam = Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams;
    assertExamOwnership(examiner, exam);

    let rescoredAttemptsCount = 0;
    const nowIso = new Date().toISOString();

    if (parsed.data.status === "REGRADED") {
      if (!dispute.question_id || parsed.data.newAwarded === undefined) {
        throw new HttpError(400, "REGRADED requires a questionId on the dispute and newAwarded marks");
      }
      const q = attempt.paper_snapshot.questions.find((x) => x.id === dispute.question_id);
      if (!q) throw new HttpError(404, "Question not found in attempt paper");
      if (parsed.data.newAwarded > q.marks) {
        throw new HttpError(400, `newAwarded cannot exceed question marks (${q.marks})`);
      }

      await supabase.from("attempt_grades").upsert(
        {
          attempt_id: attempt.id,
          question_id: dispute.question_id,
          awarded: parsed.data.newAwarded,
          max_marks: q.marks,
          feedback: `Regraded via dispute: ${parsed.data.resolution}`,
          is_pending_manual: false,
          graded_by: examiner.id,
          graded_at: nowIso,
        },
        { onConflict: "attempt_id,question_id" }
      );
      await recomputeAttemptGrading(supabase, attempt.id);
      rescoredAttemptsCount = 1;
    } else if (parsed.data.status === "AMBIGUOUS_ACCEPTED") {
      if (!dispute.question_id) {
        throw new HttpError(400, "AMBIGUOUS_ACCEPTED requires a questionId on the dispute");
      }

      // Fairly re-score EVERY real attempt in this exam that contained this ambiguous question!
      const { data: examAttempts } = await supabase
        .from("attempts")
        .select("id, paper_snapshot")
        .eq("exam_id", attempt.exam_id)
        .eq("is_sandbox", false);

      for (const att of examAttempts ?? []) {
        const snap = att.paper_snapshot as ServerPaperSnapshot;
        const q = snap.questions?.find((x) => x.id === dispute.question_id);
        if (!q) continue;

        await supabase.from("attempt_grades").upsert(
          {
            attempt_id: att.id,
            question_id: q.id,
            awarded: q.marks,
            max_marks: q.marks,
            feedback: `Full credit granted (ambiguous question accepted): ${parsed.data.resolution}`,
            is_pending_manual: false,
            graded_by: examiner.id,
            graded_at: nowIso,
          },
          { onConflict: "attempt_id,question_id" }
        );
        await recomputeAttemptGrading(supabase, att.id);
        rescoredAttemptsCount++;
      }
    }

    const { data: updated, error } = await supabase
      .from("disputes")
      .update({
        status: parsed.data.status,
        resolution: parsed.data.resolution,
        resolver_id: examiner.id,
        resolved_at: nowIso,
      })
      .eq("id", disputeId)
      .select("*")
      .single();

    if (error) throw new HttpError(500, error.message);

    await logAudit({
      actorId: examiner.id,
      action: `DISPUTE_${parsed.data.status}`,
      entity: "disputes",
      entityId: disputeId,
      before: { status: dispute.status },
      after: {
        status: parsed.data.status,
        resolution: parsed.data.resolution,
        rescoredAttemptsCount,
      },
    });

    return jsonOk({ dispute: updated, rescoredAttemptsCount });
  } catch (err) {
    return handleRouteError(err);
  }
}
