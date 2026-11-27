import { NextRequest } from "next/server";
import {
  assertExamOwnership,
  handleRouteError,
  HttpError,
  jsonOk,
  requireAuth,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { computeScoreBand, verifyAnswerChain } from "@/lib/server/chain";
import { lazyFinalizeExpiredAttempts } from "@/lib/server/grading";
import { uuidSchema } from "@/lib/shared/schemas";
import type { ServerPaperSnapshot } from "@/lib/shared/types";

export const runtime = "nodejs";

/**
 * Candidate sees ONLY their own published result (or sandbox result).
 * Examiner/Admin can inspect any attempt on exams they own.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(req);
    const { id: attemptId } = await context.params;
    if (!uuidSchema.safeParse(attemptId).success) throw new HttpError(400, "Invalid attempt ID");

    const supabase = getServiceSupabase();
    await lazyFinalizeExpiredAttempts(supabase);

    const { data: attempt } = await supabase
      .from("attempts")
      .select("*, exams(id, owner_id, title, results_published), users(id, name, email)")
      .eq("id", attemptId)
      .maybeSingle();

    if (!attempt) throw new HttpError(404, "Attempt not found");

    const exam = (Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams) as {
      id: string;
      owner_id: string;
      title: string;
      results_published: boolean;
    };

    if (user.role === "CANDIDATE") {
      if (attempt.candidate_id !== user.id) {
        throw new HttpError(403, "Forbidden: cannot view another candidate's result");
      }
      if (!attempt.is_sandbox && !exam.results_published) {
        throw new HttpError(403, "Results for this exam have not been published yet");
      }
    } else {
      assertExamOwnership(user, exam);
    }

    const { data: grades } = await supabase
      .from("attempt_grades")
      .select("*")
      .eq("attempt_id", attemptId);

    const { data: answers } = await supabase
      .from("answers")
      .select("*")
      .eq("attempt_id", attemptId)
      .order("client_seq", { ascending: true });

    const { data: receipts } = await supabase
      .from("receipts")
      .select("*")
      .eq("attempt_id", attemptId)
      .order("client_seq", { ascending: true });

    const latestAccepted = new Map<string, unknown>();
    for (const a of answers ?? []) {
      if (a.accepted) latestAccepted.set(a.question_id, a.selected);
    }

    const gradeByQ = new Map((grades ?? []).map((g) => [g.question_id, g]));
    const snapshot = attempt.paper_snapshot as ServerPaperSnapshot;

    const breakdown = (snapshot.questions ?? []).map((q) => {
      const g = gradeByQ.get(q.id);
      return {
        questionId: q.id,
        type: q.type,
        difficulty: q.difficulty,
        text: q.text,
        options: q.options,
        selected: latestAccepted.get(q.id) ?? null,
        correctOptionIds: q.correctOptionIds,
        explanation: q.explanation ?? null,
        awarded: g?.awarded !== null && g?.awarded !== undefined ? Number(g.awarded) : null,
        maxMarks: Number(q.marks),
        feedback: g?.feedback ?? null,
        isPendingManual: Boolean(g?.is_pending_manual),
      };
    });

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

    const score = attempt.score !== null ? Number(attempt.score) : null;
    const maxScore = Number(attempt.max_score);

    const questionsWithExplanations = breakdown.map((b) => ({
      id: b.questionId,
      type: b.type,
      difficulty: b.difficulty,
      text: b.text,
      marks: b.maxMarks,
      options: b.options,
      correctOptionIds: b.correctOptionIds,
      explanation: b.explanation,
      selected: b.selected ?? undefined,
      awarded: b.awarded,
      feedback: b.feedback,
      isPendingManual: b.isPendingManual,
    }));

    return jsonOk({
      attempt: {
        id: attempt.id,
        examId: exam.id,
        examTitle: exam.title,
        isSandbox: attempt.is_sandbox,
        status: attempt.status,
        startedAt: attempt.started_at,
        submittedAt: attempt.submitted_at,
        score,
        maxScore,
        scoreBand: computeScoreBand(score, maxScore),
        balanceScore: attempt.balance_score ? Number(attempt.balance_score) : null,
        verifyCode: attempt.verify_code,
      },
      exam: {
        id: exam.id,
        title: exam.title,
        results_published: exam.results_published,
        resultsPublished: exam.results_published,
      },
      candidate: attempt.users,
      grades: grades ?? [],
      questionsWithExplanations,
      breakdown,
      receipts: receipts ?? [],
      verifyCode: attempt.verify_code,
      chain,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
