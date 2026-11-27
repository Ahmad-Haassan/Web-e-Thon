import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import {
  computeExamCheckpoint,
  verifyAnswerChain,
  verifyCheckpointSignature,
  verifySeedCommitment,
} from "@/lib/server/chain";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { uuidSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

/**
 * Public Exam-Wide Cryptographic Audit (Section 10.5 & 10.7):
 * - Verifies seedReveal against published seedCommitment (if revealed).
 * - Verifies EVERY real attempt's answer hash chain.
 * - Recomputes the exam checkpoint hash and verifies its server HMAC signature.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    enforceRateLimit(`verify-exam:${ip}`, 30, 60_000);

    const { id: examId } = await context.params;
    if (!uuidSchema.safeParse(examId).success) throw new HttpError(400, "Invalid exam ID");

    const supabase = getServiceSupabase();
    const { data: exam } = await supabase
      .from("exams")
      .select("id, title, seed_commitment, seed_reveal, checkpoint_hash, checkpoint_sig")
      .eq("id", examId)
      .maybeSingle();

    if (!exam) throw new HttpError(404, "Exam not found");

    const { data: attempts } = await supabase
      .from("attempts")
      .select("id")
      .eq("exam_id", examId)
      .eq("is_sandbox", false);

    let allChainsValid = true;
    const tamperedAttempts: { attemptId: string; brokenAt: number }[] = [];
    const heads: string[] = [];

    for (const att of attempts ?? []) {
      const { data: answers } = await supabase
        .from("answers")
        .select("*")
        .eq("attempt_id", att.id)
        .order("client_seq", { ascending: true });

      const result = verifyAnswerChain(
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

      if (!result.valid) {
        allChainsValid = false;
        tamperedAttempts.push({ attemptId: att.id, brokenAt: result.brokenAt });
      }
      heads.push(`${att.id}:${result.headHash ?? "EMPTY"}`);
    }

    const recomputed = computeExamCheckpoint(examId, heads);
    const checkpointMatches =
      !exam.checkpoint_hash || exam.checkpoint_hash === recomputed.checkpointHash;
    const checkpointSigValid =
      !exam.checkpoint_hash ||
      !exam.checkpoint_sig ||
      verifyCheckpointSignature(exam.checkpoint_hash, exam.checkpoint_sig);

    const seedAudit =
      exam.seed_reveal && exam.seed_commitment
        ? {
            revealed: true,
            seedCommitment: exam.seed_commitment,
            seedReveal: exam.seed_reveal,
            commitmentValid: verifySeedCommitment(exam.seed_reveal, exam.seed_commitment),
          }
        : {
            revealed: false,
            seedCommitment: exam.seed_commitment,
            seedReveal: null,
            commitmentValid: null,
          };

    return jsonOk({
      examId: exam.id,
      examTitle: exam.title,
      valid: allChainsValid && checkpointMatches && checkpointSigValid && (seedAudit.commitmentValid ?? true),
      attemptsChecked: (attempts ?? []).length,
      allChainsValid,
      tamperedAttempts,
      checkpoint: {
        publishedHash: exam.checkpoint_hash,
        recomputedHash: recomputed.checkpointHash,
        matches: checkpointMatches,
        signatureValid: checkpointSigValid,
      },
      seedAudit,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
