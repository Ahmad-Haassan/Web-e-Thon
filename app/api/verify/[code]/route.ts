import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import {
  computeScoreBand,
  maskCandidateName,
  verifyAnswerChain,
} from "@/lib/server/chain";
import { enforceRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

/**
 * Public QR Verification Endpoint (Feature 4.6 + Security Checklist Section 8).
 * Strictly returns ONLY minimal non-private verification data:
 *   examTitle, maskedName, scoreBand, issuedAt, chain integrity status.
 * NEVER exposes email, raw answers, raw score breakdown, or other candidates.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    enforceRateLimit(`verify-code:${ip}`, 60, 60_000);

    const { code } = await context.params;
    const normalized = code.trim().toUpperCase();
    if (!normalized || normalized.length > 40) {
      throw new HttpError(400, "Invalid verification code");
    }

    const supabase = getServiceSupabase();
    const { data: attempt } = await supabase
      .from("attempts")
      .select("id, score, max_score, status, submitted_at, is_sandbox, verify_code, exams(title, results_published), users(name)")
      .eq("verify_code", normalized)
      .eq("is_sandbox", false)
      .maybeSingle();

    if (!attempt) {
      throw new HttpError(404, "Verification record not found");
    }

    const exam = (Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams) as {
      title: string;
      results_published: boolean;
    };
    const candidate = (Array.isArray(attempt.users) ? attempt.users[0] : attempt.users) as {
      name: string;
    };

    const { data: answers } = await supabase
      .from("answers")
      .select("*")
      .eq("attempt_id", attempt.id)
      .order("client_seq", { ascending: true });

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

    return jsonOk({
      verified: chain.valid,
      verifyCode: attempt.verify_code,
      examTitle: exam.title,
      maskedName: maskCandidateName(candidate?.name ?? "Candidate"),
      scoreBand: exam.results_published
        ? computeScoreBand(
            attempt.score !== null ? Number(attempt.score) : null,
            Number(attempt.max_score)
          )
        : "Results Pending Publication",
      issuedAt: attempt.submitted_at,
      chainValid: chain.valid,
      recordCount: chain.records,
      brokenAt: chain.brokenAt,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
