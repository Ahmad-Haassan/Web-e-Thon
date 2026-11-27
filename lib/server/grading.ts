import type { SupabaseClient } from "@supabase/supabase-js";
import type { PartialCreditConfig, ServerPaperSnapshot } from "@/lib/shared/types";
import { computeExamCheckpoint } from "./chain";

/**
 * Grade a SINGLE choice question: all-or-nothing, optional negative marking on wrong answer.
 * Unanswered always receives 0.
 */
export function gradeSingleQuestion(
  selected: unknown,
  correctOptionIds: string[],
  marks: number,
  negativeMarking = 0
): number {
  const chosen = Array.isArray(selected)
    ? selected.map(String).filter(Boolean)
    : typeof selected === "string" && selected
      ? [selected]
      : [];

  if (chosen.length === 0) return 0;
  if (chosen.length === 1 && correctOptionIds.includes(chosen[0])) {
    return marks;
  }
  return negativeMarking > 0 ? -Math.abs(negativeMarking) : 0;
}

/**
 * Grade a MULTI choice question:
 * - Partial credit enabled: (+correctSelected / totalCorrect - wrongSelected / totalCorrect) * marks, floored at 0
 *   (if wrongPenalty is false, wrong selections are not subtracted unless all wrong).
 * - Partial credit disabled: exact set match -> marks, else 0.
 */
export function gradeMultiQuestion(
  selected: unknown,
  correctOptionIds: string[],
  marks: number,
  config: PartialCreditConfig = { enabled: true, wrongPenalty: true }
): number {
  const chosenSet = new Set(
    Array.isArray(selected) ? selected.map(String).filter(Boolean) : []
  );
  if (chosenSet.size === 0 || correctOptionIds.length === 0) return 0;

  const correctSet = new Set(correctOptionIds);
  let correctSelected = 0;
  let wrongSelected = 0;

  for (const id of chosenSet) {
    if (correctSet.has(id)) correctSelected++;
    else wrongSelected++;
  }

  if (!config.enabled) {
    return correctSelected === correctSet.size && wrongSelected === 0 ? marks : 0;
  }

  const n = correctSet.size;
  const penalty = config.wrongPenalty ? wrongSelected / n : 0;
  const fraction = Math.max(0, correctSelected / n - penalty);
  return Number((fraction * marks).toFixed(2));
}

/**
 * Recomputes attempt_grades and total attempt score from latest ACCEPTED answers
 * in the append-only answers ledger. Preserves manual WRITTEN grades.
 * Sets status to GRADED only when zero WRITTEN questions remain pending!
 */
export async function recomputeAttemptGrading(
  supabase: SupabaseClient,
  attemptId: string
): Promise<{ score: number; maxScore: number; pendingManualCount: number; status: string }> {
  const { data: attempt, error: attErr } = await supabase
    .from("attempts")
    .select("id, exam_id, status, paper_snapshot, max_score, is_sandbox")
    .eq("id", attemptId)
    .single();

  if (attErr || !attempt) throw new Error("Attempt not found for grading");

  const { data: exam } = await supabase
    .from("exams")
    .select("partial_credit_config")
    .eq("id", attempt.exam_id)
    .single();

  const partialConfig: PartialCreditConfig = exam?.partial_credit_config ?? {
    enabled: true,
    wrongPenalty: true,
  };

  const snapshot = attempt.paper_snapshot as ServerPaperSnapshot;
  const questions = snapshot.questions ?? [];

  // Load all ACCEPTED answers ordered by client_seq ascending so latest wins
  const { data: acceptedAnswers } = await supabase
    .from("answers")
    .select("question_id, selected, client_seq")
    .eq("attempt_id", attemptId)
    .eq("accepted", true)
    .order("client_seq", { ascending: true });

  const latestByQuestion = new Map<string, unknown>();
  for (const ans of acceptedAnswers ?? []) {
    latestByQuestion.set(ans.question_id, ans.selected);
  }

  // Load existing manual grades (for WRITTEN or REGRADED disputes)
  const { data: existingGrades } = await supabase
    .from("attempt_grades")
    .select("*")
    .eq("attempt_id", attemptId);

  const existingByQ = new Map((existingGrades ?? []).map((g) => [g.question_id, g]));

  let totalScore = 0;
  let maxScore = 0;
  let pendingManualCount = 0;

  const upsertRows: Record<string, unknown>[] = [];

  for (const q of questions) {
    maxScore += Number(q.marks);
    const existing = existingByQ.get(q.id);
    const selected = latestByQuestion.get(q.id);

    if (q.type === "WRITTEN") {
      // Preserve examiner's manual grade if already graded
      if (existing && !existing.is_pending_manual && existing.awarded !== null) {
        totalScore += Number(existing.awarded);
        continue;
      }
      // If blank written answer, still mark pending unless examiner grades it (or 0 if blank? keeping pending lets examiner verify)
      const isBlank =
        !selected || (typeof selected === "string" && selected.trim().length === 0);
      if (isBlank) {
        upsertRows.push({
          attempt_id: attemptId,
          question_id: q.id,
          awarded: 0,
          max_marks: q.marks,
          feedback: "No written response submitted",
          is_pending_manual: false,
          graded_at: new Date().toISOString(),
        });
      } else {
        pendingManualCount++;
        upsertRows.push({
          attempt_id: attemptId,
          question_id: q.id,
          awarded: null,
          max_marks: q.marks,
          feedback: existing?.feedback ?? null,
          is_pending_manual: true,
        });
      }
    } else if (existing?.graded_by) {
      // Manually overridden via dispute resolution — preserve override!
      totalScore += Number(existing.awarded ?? 0);
    } else {
      const awarded =
        q.type === "SINGLE"
          ? gradeSingleQuestion(selected, q.correctOptionIds, Number(q.marks), Number(q.negativeMarking || 0))
          : gradeMultiQuestion(selected, q.correctOptionIds, Number(q.marks), partialConfig);

      totalScore += awarded;
      upsertRows.push({
        attempt_id: attemptId,
        question_id: q.id,
        awarded,
        max_marks: q.marks,
        feedback: null,
        is_pending_manual: false,
        graded_at: new Date().toISOString(),
      });
    }
  }

  if (upsertRows.length > 0) {
    await supabase
      .from("attempt_grades")
      .upsert(upsertRows, { onConflict: "attempt_id,question_id" });
  }

  const finalScore = Number(Math.max(0, totalScore).toFixed(2));
  const finalMax = Number(maxScore.toFixed(2));

  let nextStatus = attempt.status;
  if (attempt.status !== "IN_PROGRESS") {
    nextStatus = pendingManualCount === 0 ? "GRADED" : attempt.status === "EXPIRED" ? "EXPIRED" : "SUBMITTED";
  }

  await supabase
    .from("attempts")
    .update({ score: finalScore, max_score: finalMax, status: nextStatus })
    .eq("id", attemptId);

  if (!attempt.is_sandbox) {
    await refreshExamCheckpoint(supabase, attempt.exam_id);
  }

  return { score: finalScore, maxScore: finalMax, pendingManualCount, status: nextStatus };
}

/**
 * Recomputes and signs the published per-exam checkpoint hash across all real attempts' chain heads.
 */
export async function refreshExamCheckpoint(supabase: SupabaseClient, examId: string) {
  const { data: attempts } = await supabase
    .from("attempts")
    .select("id")
    .eq("exam_id", examId)
    .eq("is_sandbox", false);

  const heads: string[] = [];
  for (const att of attempts ?? []) {
    const { data: lastAns } = await supabase
      .from("answers")
      .select("hash")
      .eq("attempt_id", att.id)
      .order("client_seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    heads.push(`${att.id}:${lastAns?.hash ?? "EMPTY"}`);
  }

  const { checkpointHash, checkpointSig } = computeExamCheckpoint(examId, heads);
  await supabase
    .from("exams")
    .update({ checkpoint_hash: checkpointHash, checkpoint_sig: checkpointSig })
    .eq("id", examId);

  return { checkpointHash, checkpointSig };
}

/**
 * Lazily finalizes any IN_PROGRESS attempts whose deadline + grace has passed,
 * and triggers automatic grading on them.
 */
export async function lazyFinalizeExpiredAttempts(
  supabase: SupabaseClient,
  examId?: string
): Promise<number> {
  let query = supabase
    .from("attempts")
    .select("id, exam_id, deadline_at, exams!inner(grace_sec)")
    .eq("status", "IN_PROGRESS");

  if (examId) {
    query = query.eq("exam_id", examId);
  }

  const { data: openAttempts } = await query;
  if (!openAttempts || openAttempts.length === 0) return 0;

  const nowMs = Date.now();
  let finalized = 0;

  for (const att of openAttempts) {
    const examRel = Array.isArray(att.exams) ? att.exams[0] : att.exams;
    const graceSec = Number((examRel as { grace_sec?: number } | null)?.grace_sec ?? 15);
    const cutoff = new Date(att.deadline_at).getTime() + graceSec * 1000;

    if (nowMs > cutoff) {
      const { data: updated } = await supabase
        .from("attempts")
        .update({ status: "EXPIRED", submitted_at: att.deadline_at })
        .eq("id", att.id)
        .eq("status", "IN_PROGRESS")
        .select("id")
        .maybeSingle();

      if (updated) {
        await recomputeAttemptGrading(supabase, att.id);
        finalized++;
      }
    }
  }

  return finalized;
}
