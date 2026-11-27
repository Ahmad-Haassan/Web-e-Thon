import { NextRequest } from "next/server";
import {
  assertExamOwnership,
  computeExamLifecycle,
  handleRouteError,
  HttpError,
  jsonOk,
  requireAuth,
  requireRole,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { logAudit } from "@/lib/server/audit";
import { updateExamSchema, uuidSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(req);
    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) throw new HttpError(400, "Invalid exam ID");

    const supabase = getServiceSupabase();
    const { data: exam, error } = await supabase
      .from("exams")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new HttpError(500, error.message);
    if (!exam) throw new HttpError(404, "Exam not found");

    const lifecycle = computeExamLifecycle(exam);
    const { seed_secret: _secret, ...safeExam } = exam;
    void _secret;

    const { count: qCount } = await supabase
      .from("exam_questions")
      .select("*", { count: "exact", head: true })
      .eq("exam_id", id);

    const blueprintRules = Array.isArray(exam.blueprint)
      ? (exam.blueprint as Array<{ count?: number }>)
      : null;
    const blueprintCount = blueprintRules
      ? blueprintRules.reduce((s, r) => s + Number(r.count ?? 0), 0)
      : 0;
    const questionCount = (qCount ?? 0) > 0 ? (qCount ?? 0) : blueprintCount;

    if (user.role === "CANDIDATE") {
      // Must be enrolled and exam must be published
      const { data: enrollment } = await supabase
        .from("enrollments")
        .select("status")
        .eq("exam_id", id)
        .eq("candidate_id", user.id)
        .maybeSingle();

      if (!enrollment || enrollment.status !== "ENROLLED" || exam.status !== "PUBLISHED") {
        throw new HttpError(403, "You are not enrolled in this exam");
      }

      const { data: myAttempt } = await supabase
        .from("attempts")
        .select("id, status, started_at, deadline_at, submitted_at, score, max_score, verify_code")
        .eq("exam_id", id)
        .eq("candidate_id", user.id)
        .eq("is_sandbox", false)
        .maybeSingle();

      return jsonOk({
        exam: {
          ...safeExam,
          rules: Array.isArray(safeExam.rules) ? safeExam.rules : [],
          total_marks: Number(safeExam.total_marks),
          questionCount,
          lifecycle,
          attempt: myAttempt
            ? {
                id: myAttempt.id,
                status: myAttempt.status,
                startedAt: myAttempt.started_at,
                deadlineAt: myAttempt.deadline_at,
                submittedAt: myAttempt.submitted_at,
                score: exam.results_published ? myAttempt.score : null,
                maxScore: myAttempt.max_score,
                verifyCode: exam.results_published ? myAttempt.verify_code : null,
              }
            : null,
        },
        questionCount,
      });
    }

    assertExamOwnership(user, exam);

    const { data: attached } = await supabase
      .from("exam_questions")
      .select("marks, order_index, questions(id, type, difficulty, text, category_id, options(*))")
      .eq("exam_id", id)
      .order("order_index");

    const flattenedQuestions = (attached ?? [])
      .map((row) => {
        const q = (Array.isArray(row.questions) ? row.questions[0] : row.questions) as
          | Record<string, unknown>
          | null;
        if (!q) return null;
        return {
          ...q,
          marks: Number(row.marks ?? 0),
          order_index: row.order_index,
        };
      })
      .filter(Boolean);

    const { count: enrollmentCount } = await supabase
      .from("enrollments")
      .select("*", { count: "exact", head: true })
      .eq("exam_id", id)
      .eq("status", "ENROLLED");

    return jsonOk({
      exam: {
        ...safeExam,
        rules: Array.isArray(safeExam.rules) ? safeExam.rules : [],
        total_marks: Number(safeExam.total_marks),
        questionCount,
        lifecycle,
      },
      questions: flattenedQuestions,
      enrollmentCount: enrollmentCount ?? 0,
      questionCount,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) throw new HttpError(400, "Invalid exam ID");

    const body = await req.json();
    const parsed = updateExamSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid exam update", parsed.error.flatten());
    }

    const supabase = getServiceSupabase();
    const { data: existing } = await supabase.from("exams").select("*").eq("id", id).maybeSingle();
    if (!existing) throw new HttpError(404, "Exam not found");
    assertExamOwnership(user, existing);

    const d = parsed.data;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (d.title !== undefined) patch.title = d.title;
    if (d.category !== undefined) patch.category = d.category || null;
    if (d.className !== undefined) patch.class_name = d.className || null;
    if (d.section !== undefined) patch.section = d.section || null;
    if (d.rules !== undefined) patch.rules = d.rules;
    if (d.instructions !== undefined) patch.instructions = d.instructions;
    if (d.startAt !== undefined) patch.start_at = d.startAt;
    if (d.endAt !== undefined) patch.end_at = d.endAt;
    if (d.durationMin !== undefined) patch.duration_min = d.durationMin;
    if (d.shuffleQuestions !== undefined) patch.shuffle_questions = d.shuffleQuestions;
    if (d.shuffleOptions !== undefined) patch.shuffle_options = d.shuffleOptions;
    if (d.blueprint !== undefined) patch.blueprint = d.blueprint;
    if (d.resultsPublished !== undefined) patch.results_published = d.resultsPublished;
    if (d.graceSec !== undefined) patch.grace_sec = d.graceSec;
    if (d.partialCreditConfig !== undefined) patch.partial_credit_config = d.partialCreditConfig;
    if (d.perQuestionTimerSec !== undefined) patch.per_question_timer_sec = d.perQuestionTimerSec;
    if (d.noBacktrack !== undefined) patch.no_backtrack = d.noBacktrack;

    if (d.questions) {
      await supabase.from("exam_questions").delete().eq("exam_id", id);
      if (d.questions.length > 0) {
        const rows = d.questions.map((q, idx) => ({
          exam_id: id,
          question_id: q.questionId,
          marks: q.marks,
          order_index: q.orderIndex ?? idx,
        }));
        const { error: qErr } = await supabase.from("exam_questions").insert(rows);
        if (qErr) throw new HttpError(400, qErr.message);
      }
      patch.total_marks = d.questions.reduce((s, q) => s + q.marks, 0);
    }

    if (d.status === "PUBLISHED") {
      // Review guard: require at least 1 question attached OR a valid blueprint before publishing
      const { count: qCount } = await supabase
        .from("exam_questions")
        .select("*", { count: "exact", head: true })
        .eq("exam_id", id);
      const hasBlueprint =
        Array.isArray(d.blueprint ?? existing.blueprint) &&
        ((d.blueprint ?? existing.blueprint) as unknown[]).length > 0;
      if ((!qCount || qCount < 1) && !hasBlueprint) {
        throw new HttpError(400, "Attach at least one question before publishing the exam");
      }
      patch.status = "PUBLISHED";
    } else if (d.status === "DRAFT") {
      patch.status = "DRAFT";
    }

    // Seed reveal (Section 10.5): only allowed once exam window has ended or results are published
    if (d.revealSeed) {
      const lifecycle = computeExamLifecycle(existing);
      if (lifecycle !== "COMPLETED" && !d.resultsPublished && !existing.results_published) {
        throw new HttpError(
          400,
          "Seed can only be revealed after the exam completes or results are published"
        );
      }
      patch.seed_reveal = existing.seed_secret;
    }

    const { data: updated, error } = await supabase
      .from("exams")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !updated) throw new HttpError(500, error?.message ?? "Failed updating exam");

    await logAudit({
      actorId: user.id,
      action: "EXAM_UPDATED",
      entity: "exams",
      entityId: id,
      before: { status: existing.status, results_published: existing.results_published },
      after: {
        status: updated.status,
        results_published: updated.results_published,
        seed_revealed: Boolean(updated.seed_reveal),
      },
    });

    const { seed_secret: _secret, ...safe } = updated;
    void _secret;
    return jsonOk({
      exam: {
        ...safe,
        rules: Array.isArray(safe.rules) ? safe.rules : [],
        total_marks: Number(safe.total_marks),
        lifecycle: computeExamLifecycle(updated),
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) throw new HttpError(400, "Invalid exam ID");

    const supabase = getServiceSupabase();
    const { data: existing } = await supabase.from("exams").select("id, owner_id").eq("id", id).maybeSingle();
    if (!existing) throw new HttpError(404, "Exam not found");
    assertExamOwnership(user, existing);

    const { error } = await supabase.from("exams").delete().eq("id", id);
    if (error) throw new HttpError(500, error.message);

    await logAudit({
      actorId: user.id,
      action: "EXAM_DELETED",
      entity: "exams",
      entityId: id,
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
