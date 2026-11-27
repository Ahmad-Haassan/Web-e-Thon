import { NextRequest } from "next/server";
import {
  assertExamOwnership,
  handleRouteError,
  HttpError,
  jsonOk,
  requireAuth,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { stripPaperSnapshot } from "@/lib/server/randomizer";
import { lazyFinalizeExpiredAttempts } from "@/lib/server/grading";
import { uuidSchema } from "@/lib/shared/schemas";
import type { ServerPaperSnapshot } from "@/lib/shared/types";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(req);
    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) throw new HttpError(400, "Invalid attempt ID");

    const supabase = getServiceSupabase();
    await lazyFinalizeExpiredAttempts(supabase);

    const { data: attempt, error } = await supabase
      .from("attempts")
      .select("*, exams(id, owner_id, title, instructions, grace_sec, results_published, per_question_timer_sec, no_backtrack, seed_commitment)")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new HttpError(500, error.message);
    if (!attempt) throw new HttpError(404, "Attempt not found");

    const exam = (Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams) as {
      id: string;
      owner_id: string;
      title: string;
      instructions: string;
      grace_sec: number;
      results_published: boolean;
      per_question_timer_sec: number | null;
      no_backtrack: boolean;
      seed_commitment: string | null;
    };

    if (user.role === "CANDIDATE") {
      if (attempt.candidate_id !== user.id) {
        throw new HttpError(403, "Forbidden: cannot read another candidate's attempt");
      }
    } else {
      assertExamOwnership(user, exam);
    }

    const { data: answers } = await supabase
      .from("answers")
      .select("id, question_id, selected, marked, client_seq, saved_at, received_at, accepted, reject_reason, hash")
      .eq("attempt_id", id)
      .order("client_seq", { ascending: true });

    const { data: receipts } = await supabase
      .from("receipts")
      .select("*")
      .eq("attempt_id", id)
      .order("client_seq", { ascending: true });

    const snapshot = attempt.paper_snapshot as ServerPaperSnapshot;
    // Strip answer keys for candidates ALWAYS while IN_PROGRESS (and if results not published)
    const exposeKeys =
      user.role !== "CANDIDATE" ||
      (attempt.status !== "IN_PROGRESS" && exam.results_published);

    return jsonOk({
      attempt: {
        id: attempt.id,
        examId: attempt.exam_id,
        candidateId: attempt.candidate_id,
        isSandbox: attempt.is_sandbox,
        status: attempt.status,
        startedAt: attempt.started_at,
        deadlineAt: attempt.deadline_at,
        submittedAt: attempt.submitted_at,
        score: exposeKeys ? (attempt.score !== null ? Number(attempt.score) : null) : null,
        maxScore: Number(attempt.max_score),
        balanceScore: attempt.balance_score ? Number(attempt.balance_score) : null,
        verifyCode: exposeKeys ? attempt.verify_code : null,
      },
      exam: {
        id: exam.id,
        title: exam.title,
        instructions: exam.instructions,
        graceSec: exam.grace_sec,
        perQuestionTimerSec: exam.per_question_timer_sec,
        noBacktrack: exam.no_backtrack,
        seedCommitment: exam.seed_commitment,
      },
      questions: exposeKeys ? snapshot.questions : stripPaperSnapshot(snapshot),
      savedAnswers: answers ?? [],
      receipts: receipts ?? [],
      serverNow: Date.now(),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
