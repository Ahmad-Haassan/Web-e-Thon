import { NextRequest } from "next/server";
import {
  assertExamOwnership,
  handleRouteError,
  HttpError,
  jsonOk,
  requireRole,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import {
  verifyAnswerChain,
  verifyCheckpointSignature,
  verifyEventChain,
  verifySeedCommitment,
} from "@/lib/server/chain";
import { logAudit } from "@/lib/server/audit";
import { uuidSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

/**
 * Examiner Cryptographic Integrity Audit:
 * Verifies SHA-256 hash chains across real attempts (answers, events, lock_events),
 * checkpoint HMAC signatures, and revealed seed commitments for the examiner's own exams
 * (or a specific owned examId).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const rawBody = (await req.json().catch(() => ({}))) as { examId?: unknown };
    const examId =
      typeof rawBody?.examId === "string" && rawBody.examId.trim().length > 0
        ? rawBody.examId.trim()
        : undefined;

    if (examId && !uuidSchema.safeParse(examId).success) {
      throw new HttpError(400, "Invalid examId");
    }

    const supabase = getServiceSupabase();
    let examQuery = supabase
      .from("exams")
      .select(
        "id, owner_id, title, seed_commitment, seed_reveal, checkpoint_hash, checkpoint_sig"
      );

    if (examId) {
      examQuery = examQuery.eq("id", examId);
    } else if (user.role === "EXAMINER") {
      examQuery = examQuery.eq("owner_id", user.id);
    }

    const { data: exams, error: examErr } = await examQuery;
    if (examErr) throw new HttpError(500, examErr.message);

    const targetExams = exams ?? [];
    if (examId) {
      if (targetExams.length === 0) throw new HttpError(404, "Exam not found");
      assertExamOwnership(user, targetExams[0]);
    }

    const examIds = targetExams.map((e) => e.id);
    let attempts: Array<{ id: string; exam_id: string; verify_code: string; status: string }> = [];

    if (examIds.length > 0) {
      const { data: attRows, error: attErr } = await supabase
        .from("attempts")
        .select("id, exam_id, verify_code, status")
        .in("exam_id", examIds)
        .eq("is_sandbox", false);
      if (attErr) throw new HttpError(500, attErr.message);
      attempts = attRows ?? [];
    }

    let answersChecked = 0;
    let eventsChecked = 0;
    let lockEventsChecked = 0;

    const tamperedAttempts: Array<{
      attemptId: string;
      examId: string;
      verifyCode: string;
      chain: "answers" | "events" | "lock_events";
      brokenAt: number;
    }> = [];

    const tamperedExamSet = new Set<string>();
    const attemptsByExam = new Map<string, number>();

    for (const att of attempts) {
      attemptsByExam.set(att.exam_id, (attemptsByExam.get(att.exam_id) ?? 0) + 1);

      const [{ data: answers }, { data: events }, { data: lockEvents }] = await Promise.all([
        supabase
          .from("answers")
          .select("*")
          .eq("attempt_id", att.id)
          .order("client_seq", { ascending: true }),
        supabase
          .from("events")
          .select("*")
          .eq("attempt_id", att.id)
          .order("seq", { ascending: true }),
        supabase
          .from("lock_events")
          .select("*")
          .eq("attempt_id", att.id)
          .order("seq", { ascending: true }),
      ]);

      const aCheck = verifyAnswerChain(
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
      answersChecked += aCheck.records;
      if (!aCheck.valid) {
        tamperedExamSet.add(att.exam_id);
        tamperedAttempts.push({
          attemptId: att.id,
          examId: att.exam_id,
          verifyCode: att.verify_code,
          chain: "answers",
          brokenAt: aCheck.brokenAt,
        });
      }

      const eCheck = verifyEventChain(
        (events ?? []).map((e) => ({
          attemptId: e.attempt_id,
          seq: e.seq,
          type: e.type,
          meta: (e.meta ?? {}) as Record<string, unknown>,
          at: e.at,
          prevHash: e.prev_hash,
          hash: e.hash,
        }))
      );
      eventsChecked += eCheck.records;
      if (!eCheck.valid) {
        tamperedExamSet.add(att.exam_id);
        tamperedAttempts.push({
          attemptId: att.id,
          examId: att.exam_id,
          verifyCode: att.verify_code,
          chain: "events",
          brokenAt: eCheck.brokenAt,
        });
      }

      const lCheck = verifyEventChain(
        (lockEvents ?? []).map((l) => ({
          attemptId: l.attempt_id,
          seq: l.seq,
          type: l.type,
          actorId: l.actor_id,
          meta: (l.meta ?? {}) as Record<string, unknown>,
          at: l.at,
          prevHash: l.prev_hash,
          hash: l.hash,
        }))
      );
      lockEventsChecked += lCheck.records;
      if (!lCheck.valid) {
        tamperedExamSet.add(att.exam_id);
        tamperedAttempts.push({
          attemptId: att.id,
          examId: att.exam_id,
          verifyCode: att.verify_code,
          chain: "lock_events",
          brokenAt: lCheck.brokenAt,
        });
      }
    }

    const invalidCheckpoints: Array<{ examId: string; title: string }> = [];
    const perExam = targetExams.map((ex) => {
      const checkpointValid =
        !ex.checkpoint_hash ||
        !ex.checkpoint_sig ||
        verifyCheckpointSignature(ex.checkpoint_hash, ex.checkpoint_sig);

      const seedValid =
        !ex.seed_reveal ||
        !ex.seed_commitment ||
        verifySeedCommitment(ex.seed_reveal, ex.seed_commitment);

      if (!checkpointValid) {
        invalidCheckpoints.push({ examId: ex.id, title: ex.title });
      }

      const valid = !tamperedExamSet.has(ex.id) && checkpointValid && seedValid;
      return {
        examId: ex.id,
        title: ex.title,
        attemptsChecked: attemptsByExam.get(ex.id) ?? 0,
        checkpointValid,
        seedValid,
        valid,
      };
    });

    const allValid =
      tamperedAttempts.length === 0 &&
      invalidCheckpoints.length === 0 &&
      perExam.every((e) => e.valid);

    const checkedAt = new Date().toISOString();

    await logAudit({
      actorId: user.id,
      action: "EXAMINER_INTEGRITY_AUDIT",
      entity: "exams",
      entityId: examId ?? null,
      after: {
        allValid,
        examsChecked: targetExams.length,
        attemptsChecked: attempts.length,
        answersChecked,
        eventsChecked,
        lockEventsChecked,
        tamperedCount: tamperedAttempts.length,
      },
    });

    return jsonOk({
      allValid,
      checkedAt,
      examsChecked: targetExams.length,
      attemptsChecked: attempts.length,
      answersChecked,
      eventsChecked,
      lockEventsChecked,
      perExam,
      tamperedAttempts,
      invalidCheckpoints,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
