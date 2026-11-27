import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import {
  assertExamOwnership,
  handleRouteError,
  HttpError,
  jsonOk,
  requireAuth,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { generateSeedPair, generateVerifyCode } from "@/lib/server/chain";
import {
  generateFairPaperSnapshot,
  stripPaperSnapshot,
  type PoolQuestion,
} from "@/lib/server/randomizer";
import { lazyFinalizeExpiredAttempts } from "@/lib/server/grading";
import { startAttemptSchema, uuidSchema } from "@/lib/shared/schemas";
import type { BlueprintRule, ServerPaperSnapshot } from "@/lib/shared/types";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(req);
    const { id: examId } = await context.params;
    if (!uuidSchema.safeParse(examId).success) throw new HttpError(400, "Invalid exam ID");

    let rawBody: unknown = {};
    try {
      rawBody = await req.json();
    } catch {
      rawBody = {};
    }
    const parsed = startAttemptSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid start attempt payload", parsed.error.flatten());
    }

    const isSandbox = parsed.data.isSandbox;
    const supabase = getServiceSupabase();

    await lazyFinalizeExpiredAttempts(supabase, examId);

    const { data: exam, error: exErr } = await supabase
      .from("exams")
      .select("*")
      .eq("id", examId)
      .maybeSingle();

    if (exErr) throw new HttpError(500, exErr.message);
    if (!exam) throw new HttpError(404, "Exam not found");

    const nowMs = Date.now();
    const startMs = new Date(exam.start_at).getTime();
    const endMs = new Date(exam.end_at).getTime();

    if (isSandbox) {
      // Sandbox preview allowed for exam owner/admin anytime, OR enrolled candidates if published
      if (user.role === "CANDIDATE") {
        const { data: enr } = await supabase
          .from("enrollments")
          .select("status")
          .eq("exam_id", examId)
          .eq("candidate_id", user.id)
          .maybeSingle();
        if (!enr || enr.status !== "ENROLLED") {
          throw new HttpError(403, "Not enrolled in this exam");
        }
      } else {
        assertExamOwnership(user, exam);
      }
    } else {
      // Real exam attempt rules (Section 5.4 + Test Plan)
      if (exam.status !== "PUBLISHED") {
        throw new HttpError(403, "Exam is not published yet");
      }
      if (nowMs < startMs) {
        throw new HttpError(403, "Exam has not started yet");
      }
      if (nowMs > endMs) {
        throw new HttpError(403, "Exam window has ended");
      }

      const { data: enrollment } = await supabase
        .from("enrollments")
        .select("status")
        .eq("exam_id", examId)
        .eq("candidate_id", user.id)
        .maybeSingle();

      if (!enrollment || enrollment.status !== "ENROLLED") {
        throw new HttpError(403, "You are not enrolled in this exam");
      }

      // Check existing real attempt (idempotent resume if IN_PROGRESS, block if already submitted)
      const { data: existing } = await supabase
        .from("attempts")
        .select("*")
        .eq("exam_id", examId)
        .eq("candidate_id", user.id)
        .eq("is_sandbox", false)
        .maybeSingle();

      if (existing) {
        if (existing.status !== "IN_PROGRESS") {
          throw new HttpError(409, "You have already completed this exam");
        }

        const sessionToken = randomBytes(16).toString("hex");
        await supabase
          .from("attempts")
          .update({ active_session_token: sessionToken, last_seen_at: new Date().toISOString() })
          .eq("id", existing.id);

        const { data: savedAnswers } = await supabase
          .from("answers")
          .select("question_id, selected, marked, client_seq, saved_at, received_at, accepted")
          .eq("attempt_id", existing.id)
          .eq("accepted", true)
          .order("client_seq", { ascending: true });

        const { data: receipts } = await supabase
          .from("receipts")
          .select("*")
          .eq("attempt_id", existing.id)
          .order("client_seq", { ascending: true });

        const snapshot = existing.paper_snapshot as ServerPaperSnapshot;
        return jsonOk({
          resumed: true,
          attempt: {
            id: existing.id,
            examId: existing.exam_id,
            status: existing.status,
            isSandbox: existing.is_sandbox,
            startedAt: existing.started_at,
            deadlineAt: existing.deadline_at,
            maxScore: Number(existing.max_score),
            balanceScore: existing.balance_score ? Number(existing.balance_score) : null,
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
          questions: stripPaperSnapshot(snapshot),
          savedAnswers: savedAnswers ?? [],
          receipts: receipts ?? [],
          serverNow: Date.now(),
          sessionToken,
        });
      }
    }

    // Build question pool from exam_questions + options + question_keys (server-only)
    const { data: eqRows, error: eqErr } = await supabase
      .from("exam_questions")
      .select("marks, order_index, questions(*, options(*), question_keys(*))")
      .eq("exam_id", examId)
      .order("order_index");

    if (eqErr) throw new HttpError(500, eqErr.message);
    if (!eqRows || eqRows.length === 0) {
      throw new HttpError(400, "Exam has no questions configured");
    }

    const pool: PoolQuestion[] = eqRows
      .map((row): PoolQuestion | null => {
        const q = (Array.isArray(row.questions) ? row.questions[0] : row.questions) as Record<
          string,
          unknown
        > | null;
        if (!q) return null;
        const keyRel = Array.isArray(q.question_keys) ? q.question_keys[0] : q.question_keys;
        const opts = ([...(Array.isArray(q.options) ? q.options : [])] as {
          id: string;
          text: string;
          order_index: number;
        }[]).sort((a, b) => a.order_index - b.order_index);

        return {
          id: String(q.id),
          categoryId: q.category_id ? String(q.category_id) : null,
          type: q.type as "SINGLE" | "MULTI" | "WRITTEN",
          difficulty: Number(q.difficulty) as 1 | 2 | 3,
          text: String(q.text),
          marks: Number(row.marks ?? q.marks),
          negativeMarking: Number(q.negative_marking ?? 0),
          explanation: q.explanation ? String(q.explanation) : null,
          historicalDifficultyIndex:
            q.historical_difficulty_index !== null && q.historical_difficulty_index !== undefined
              ? Number(q.historical_difficulty_index)
              : null,
          options: opts.map((o) => ({ id: o.id, text: o.text })),
          correctOptionIds: (keyRel as { correct_option_ids?: string[] } | null)?.correct_option_ids ?? [],
          writtenRubric: (keyRel as { written_rubric?: string | null } | null)?.written_rubric ?? null,
        };
      })
      .filter((x): x is PoolQuestion => x !== null);

    // Ensure exam has a seed_secret
    let seedSecret = exam.seed_secret as string | null;
    if (!seedSecret) {
      const pair = generateSeedPair();
      seedSecret = pair.seedSecret;
      await supabase
        .from("exams")
        .update({ seed_secret: pair.seedSecret, seed_commitment: pair.seedCommitment })
        .eq("id", examId);
    }

    const snapshot = generateFairPaperSnapshot({
      examId,
      candidateId: isSandbox ? `sandbox:${user.id}:${Date.now()}` : user.id,
      seedSecret,
      pool,
      blueprint: (exam.blueprint as BlueprintRule[] | null) ?? null,
      shuffleQuestions: Boolean(exam.shuffle_questions),
      shuffleOptions: Boolean(exam.shuffle_options),
    });

    const startedAt = new Date(nowMs);
    const durationEndMs = nowMs + Number(exam.duration_min) * 60 * 1000;
    // Real attempts cannot run past exam.end_at
    const deadlineMs = isSandbox ? durationEndMs : Math.min(durationEndMs, endMs);
    const deadlineAt = new Date(deadlineMs);
    const sessionToken = randomBytes(16).toString("hex");
    const verifyCode = generateVerifyCode();

    const { data: created, error: cErr } = await supabase
      .from("attempts")
      .insert({
        exam_id: examId,
        candidate_id: user.id,
        is_sandbox: isSandbox,
        started_at: startedAt.toISOString(),
        deadline_at: deadlineAt.toISOString(),
        status: "IN_PROGRESS",
        max_score: snapshot.totalMarks,
        paper_snapshot: snapshot,
        balance_score: snapshot.balanceScore,
        verify_code: verifyCode,
        active_session_token: sessionToken,
        last_seen_at: startedAt.toISOString(),
        integrity_ack_at: parsed.data.integrityAck ? startedAt.toISOString() : null,
      })
      .select("*")
      .single();

    if (cErr || !created) {
      throw new HttpError(409, cErr?.message ?? "Failed to start attempt");
    }

    return jsonOk(
      {
        resumed: false,
        attempt: {
          id: created.id,
          examId: created.exam_id,
          status: created.status,
          isSandbox: created.is_sandbox,
          startedAt: created.started_at,
          deadlineAt: created.deadline_at,
          maxScore: Number(created.max_score),
          balanceScore: Number(created.balance_score),
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
        questions: stripPaperSnapshot(snapshot),
        savedAnswers: [],
        receipts: [],
        serverNow: Date.now(),
        sessionToken,
      },
      201
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
