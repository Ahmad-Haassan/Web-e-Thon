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

function extractCount(val: unknown): number | undefined {
  if (Array.isArray(val) && val[0] && typeof val[0] === "object" && "count" in val[0]) {
    return Number((val[0] as { count: unknown }).count ?? 0);
  }
  return undefined;
}

function sanitizeExamRow(exam: Record<string, unknown>) {
  // NEVER expose seed_secret before reveal!
  const { seed_secret: _secret, enrollments: enrAgg, exam_questions: eqAgg, ...safe } = exam;
  void _secret;
  const enrollmentCount = extractCount(enrAgg);
  const questionCount = extractCount(eqAgg);
  const blueprintRules = Array.isArray(exam.blueprint)
    ? (exam.blueprint as Array<{ count?: number }>)
    : null;
  const blueprintCount = blueprintRules
    ? blueprintRules.reduce((s, r) => s + Number(r.count ?? 0), 0)
    : 0;

  return {
    ...safe,
    rules: Array.isArray(exam.rules) ? exam.rules : [],
    total_marks: Number(exam.total_marks ?? 0),
    ...(enrollmentCount !== undefined ? { enrollmentCount } : {}),
    questionCount: questionCount && questionCount > 0 ? questionCount : blueprintCount,
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
      .select("status, exams(*, exam_questions(count))")
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

    // Optional: create inline questions directly in the Question Bank & collect them to attach
    const inlineAttached: Array<{ questionId: string; marks: number; orderIndex: number }> = [];
    const baseOrder = (d.questions ?? []).length;

    if (d.inlineQuestions && d.inlineQuestions.length > 0) {
      for (let i = 0; i < d.inlineQuestions.length; i++) {
        const iq = d.inlineQuestions[i];
        const { data: createdQ, error: qInsErr } = await supabase
          .from("questions")
          .insert({
            owner_id: user.id,
            category_id: iq.categoryId ?? null,
            type: iq.type,
            difficulty: iq.difficulty,
            text: iq.text,
            marks: iq.marks,
            negative_marking: iq.negativeMarking ?? 0,
            explanation: iq.explanation ?? null,
          })
          .select("id")
          .single();

        if (qInsErr || !createdQ) {
          throw new HttpError(400, `Failed creating inline question #${i + 1}: ${qInsErr?.message ?? "error"}`);
        }

        const correctIds: string[] = [];
        if (iq.type !== "WRITTEN" && iq.options.length > 0) {
          const optRows = iq.options.map((o, idx) => ({
            question_id: createdQ.id,
            text: o.text,
            order_index: idx,
          }));
          const { data: insertedOpts, error: oErr } = await supabase
            .from("options")
            .insert(optRows)
            .select("id, order_index");

          if (oErr || !insertedOpts) {
            throw new HttpError(400, `Failed creating options for inline question #${i + 1}`);
          }

          for (const opt of insertedOpts) {
            if (iq.options[opt.order_index]?.isCorrect) {
              correctIds.push(opt.id);
            }
          }
        }

        await supabase.from("question_keys").insert({
          question_id: createdQ.id,
          correct_option_ids: correctIds,
          written_rubric: iq.writtenRubric ?? null,
        });

        inlineAttached.push({
          questionId: createdQ.id,
          marks: iq.marks,
          orderIndex: baseOrder + i,
        });
      }
    }

    const allAttached = [
      ...(d.questions ?? []).map((q, idx) => ({
        questionId: q.questionId,
        marks: q.marks,
        orderIndex: q.orderIndex ?? idx,
      })),
      ...inlineAttached,
    ];

    const totalMarks = allAttached.reduce((sum, q) => sum + q.marks, 0);

    const { data: exam, error } = await supabase
      .from("exams")
      .insert({
        owner_id: user.id,
        title: d.title,
        category: d.category || null,
        class_name: d.className || null,
        section: d.section || null,
        rules: d.rules ?? [],
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

    if (allAttached.length > 0) {
      const attachRows = allAttached.map((q) => ({
        exam_id: exam.id,
        question_id: q.questionId,
        marks: q.marks,
        order_index: q.orderIndex,
      }));
      const { error: qErr } = await supabase.from("exam_questions").insert(attachRows);
      if (qErr) throw new HttpError(400, `Failed attaching questions: ${qErr.message}`);
    }

    // Optional: Auto-enroll all candidates matching target class (& section if set)
    let autoEnrolledCount = 0;
    if (d.autoEnrollClass && d.className && d.className.trim()) {
      let stuQuery = supabase
        .from("users")
        .select("id")
        .eq("role", "CANDIDATE")
        .eq("active", true)
        .ilike("class_name", d.className.trim());

      if (d.section && d.section.trim()) {
        stuQuery = stuQuery.ilike("section", d.section.trim());
      }

      const { data: matchingStudents } = await stuQuery;
      if (matchingStudents && matchingStudents.length > 0) {
        const enrollRows = matchingStudents.map((s) => ({
          exam_id: exam.id,
          candidate_id: s.id,
          status: "ENROLLED" as const,
        }));
        const { error: eErr } = await supabase
          .from("enrollments")
          .upsert(enrollRows, { onConflict: "exam_id,candidate_id" });
        if (!eErr) autoEnrolledCount = enrollRows.length;
      }
    }

    await logAudit({
      actorId: user.id,
      action: "EXAM_CREATED",
      entity: "exams",
      entityId: exam.id,
      after: {
        title: d.title,
        className: d.className ?? null,
        section: d.section ?? null,
        inlineQuestionsCount: inlineAttached.length,
        autoEnrolledCount,
        seedCommitment,
      },
    });

    return jsonOk(
      {
        exam: {
          ...sanitizeExamRow(exam),
          enrollmentCount: autoEnrolledCount,
          questionCount: allAttached.length,
        },
        autoEnrolledCount,
      },
      201
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
