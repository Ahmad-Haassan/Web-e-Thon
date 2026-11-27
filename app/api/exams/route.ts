import { NextRequest } from "next/server";
import {
  computeExamLifecycle,
  handleRouteError,
  HttpError,
  jsonOk,
  requireAuth,
  requireRole,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { generateSeedPair } from "@/lib/server/chain";
import { logAudit } from "@/lib/server/audit";
import { lazyFinalizeExpiredAttempts } from "@/lib/server/grading";
import { createExamSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

function sanitizeExamRow(exam: Record<string, unknown>) {
  // NEVER expose seed_secret before reveal!
  const { seed_secret: _secret, ...safe } = exam;
  void _secret;
  return {
    ...safe,
    total_marks: Number(exam.total_marks ?? 0),
    lifecycle: computeExamLifecycle({
      status: exam.status as "DRAFT" | "PUBLISHED",
      start_at: String(exam.start_at),
      end_at: String(exam.end_at),
    }),
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const supabase = getServiceSupabase();

    if (user.role === "ADMIN" || user.role === "EXAMINER") {
      let query = supabase
        .from("exams")
        .select("*, enrollments(count), exam_questions(count)")
        .order("created_at", { ascending: false });

      if (user.role === "EXAMINER") {
        query = query.eq("owner_id", user.id);
      }

      const { data, error } = await query;
      if (error) throw new HttpError(500, error.message);

      return jsonOk({
        exams: (data ?? []).map((e) => sanitizeExamRow(e)),
      });
    }

    // CANDIDATE: return enrolled published exams grouped into available / upcoming / completed
    await lazyFinalizeExpiredAttempts(supabase);

    const { data: enrollments, error: enrErr } = await supabase
      .from("enrollments")
      .select("status, exams(*)")
      .eq("candidate_id", user.id)
      .eq("status", "ENROLLED");

    if (enrErr) throw new HttpError(500, enrErr.message);

    const { data: myAttempts } = await supabase
      .from("attempts")
      .select("id, exam_id, status, score, max_score, started_at, deadline_at, submitted_at, is_sandbox, verify_code")
      .eq("candidate_id", user.id)
      .eq("is_sandbox", false);

    const attemptByExam = new Map((myAttempts ?? []).map((a) => [a.exam_id, a]));

    const available: unknown[] = [];
    const upcoming: unknown[] = [];
    const completed: unknown[] = [];

    for (const row of enrollments ?? []) {
      const exam = (Array.isArray(row.exams) ? row.exams[0] : row.exams) as Record<string, unknown> | null;
      if (!exam || exam.status !== "PUBLISHED") continue;

      const safe = sanitizeExamRow(exam);
      const attempt = attemptByExam.get(String(exam.id)) ?? null;
      const resultsVisible = Boolean(exam.results_published);

      const entry = {
        ...safe,
        accessStatus:
          attempt && attempt.status !== "IN_PROGRESS"
            ? "SUBMITTED"
            : safe.lifecycle === "ONGOING"
              ? "OPEN"
              : safe.lifecycle === "PUBLISHED"
                ? "NOT_STARTED"
                : "CLOSED",
        attempt: attempt
          ? {
              id: attempt.id,
              status: attempt.status,
              startedAt: attempt.started_at,
              deadlineAt: attempt.deadline_at,
              submittedAt: attempt.submitted_at,
              score: resultsVisible ? attempt.score : null,
              maxScore: attempt.max_score,
              verifyCode: resultsVisible ? attempt.verify_code : null,
            }
          : null,
      };

      if (attempt && attempt.status !== "IN_PROGRESS") {
        completed.push(entry);
      } else if (safe.lifecycle === "ONGOING") {
        available.push(entry);
      } else if (safe.lifecycle === "PUBLISHED") {
        upcoming.push(entry);
      } else {
        completed.push(entry);
      }
    }

    return jsonOk({ available, upcoming, completed });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const body = await req.json();
    const parsed = createExamSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid exam payload", parsed.error.flatten());
    }

    const d = parsed.data;
    const supabase = getServiceSupabase();
    const { seedSecret, seedCommitment } = generateSeedPair();

    const totalMarks = (d.questions ?? []).reduce((sum, q) => sum + q.marks, 0);

    const { data: exam, error } = await supabase
      .from("exams")
      .insert({
        owner_id: user.id,
        title: d.title,
        instructions: d.instructions,
        start_at: d.startAt,
        end_at: d.endAt,
        duration_min: d.durationMin,
        total_marks: totalMarks,
        status: "DRAFT",
        shuffle_questions: d.shuffleQuestions,
        shuffle_options: d.shuffleOptions,
        blueprint: d.blueprint ?? null,
        grace_sec: d.graceSec,
        partial_credit_config: d.partialCreditConfig,
        per_question_timer_sec: d.perQuestionTimerSec ?? null,
        no_backtrack: d.noBacktrack,
        seed_secret: seedSecret,
        seed_commitment: seedCommitment,
      })
      .select("*")
      .single();

    if (error || !exam) throw new HttpError(500, error?.message ?? "Failed to create exam");

    if (d.questions && d.questions.length > 0) {
      const attachRows = d.questions.map((q, idx) => ({
        exam_id: exam.id,
        question_id: q.questionId,
        marks: q.marks,
        order_index: q.orderIndex ?? idx,
      }));
      const { error: qErr } = await supabase.from("exam_questions").insert(attachRows);
      if (qErr) throw new HttpError(400, `Failed attaching questions: ${qErr.message}`);
    }

    await logAudit({
      actorId: user.id,
      action: "EXAM_CREATED",
      entity: "exams",
      entityId: exam.id,
      after: { title: d.title, seedCommitment },
    });

    return jsonOk({ exam: sanitizeExamRow(exam) }, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
