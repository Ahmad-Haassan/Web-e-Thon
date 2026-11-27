import { NextRequest } from "next/server";
import {
  assertExamOwnership,
  handleRouteError,
  HttpError,
  jsonOk,
  requireRole,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { recomputeAttemptGrading } from "@/lib/server/grading";
import { logAudit } from "@/lib/server/audit";
import { manualGradeSchema, uuidSchema } from "@/lib/shared/schemas";
import type { ServerPaperSnapshot } from "@/lib/shared/types";

export const runtime = "nodejs";

/**
 * Manual grading endpoint for WRITTEN questions (or manual adjustments).
 * Validates 0 <= awarded <= question.marks, recomputes totals, sets GRADED once zero pending.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const examiner = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const { id: attemptId } = await context.params;
    if (!uuidSchema.safeParse(attemptId).success) throw new HttpError(400, "Invalid attempt ID");

    const body = await req.json();
    const parsed = manualGradeSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid grading payload", parsed.error.flatten());
    }

    const supabase = getServiceSupabase();
    const { data: attempt } = await supabase
      .from("attempts")
      .select("*, exams(owner_id)")
      .eq("id", attemptId)
      .maybeSingle();

    if (!attempt) throw new HttpError(404, "Attempt not found");
    if (attempt.is_sandbox) {
      throw new HttpError(400, "Sandbox attempts cannot be graded in the grading queue");
    }

    const exam = (Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams) as {
      owner_id: string;
    };
    assertExamOwnership(examiner, exam);

    const snapshot = attempt.paper_snapshot as ServerPaperSnapshot;
    const question = snapshot.questions.find((q) => q.id === parsed.data.questionId);
    if (!question) throw new HttpError(404, "Question not found in this attempt's paper");

    if (parsed.data.awarded < 0 || parsed.data.awarded > Number(question.marks)) {
      throw new HttpError(
        400,
        `Awarded marks must be between 0 and ${question.marks}`
      );
    }

    const { data: grade, error: gErr } = await supabase
      .from("attempt_grades")
      .upsert(
        {
          attempt_id: attemptId,
          question_id: parsed.data.questionId,
          awarded: parsed.data.awarded,
          max_marks: question.marks,
          feedback: parsed.data.feedback,
          is_pending_manual: false,
          graded_by: examiner.id,
          graded_at: new Date().toISOString(),
        },
        { onConflict: "attempt_id,question_id" }
      )
      .select("*")
      .single();

    if (gErr) throw new HttpError(500, gErr.message);

    const summary = await recomputeAttemptGrading(supabase, attemptId);

    await logAudit({
      actorId: examiner.id,
      action: "MANUAL_GRADE_SAVED",
      entity: "attempt_grades",
      entityId: `${attemptId}:${parsed.data.questionId}`,
      after: { awarded: parsed.data.awarded, maxMarks: question.marks, feedback: parsed.data.feedback },
    });

    return jsonOk({ grade, attempt: summary });
  } catch (err) {
    return handleRouteError(err);
  }
}
