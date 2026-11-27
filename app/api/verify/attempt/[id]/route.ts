import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { verifyAnswerChain, verifyEventChain } from "@/lib/server/chain";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { uuidSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

/**
 * Public Cryptographic Chain Verifier per Attempt (Section 10.5 demo moment!).
 * Recomputes SHA-256 hash chains and HMAC receipts across answers, events, and lock_events.
 * Editing ANY row directly in the database causes `valid` to turn `false` with exact `brokenAt` index!
 * Exposes ZERO private candidate content (only hashes, counts, and validity).
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    enforceRateLimit(`verify-attempt:${ip}`, 60, 60_000);

    const { id: attemptId } = await context.params;
    if (!uuidSchema.safeParse(attemptId).success) {
      throw new HttpError(400, "Invalid attempt ID");
    }

    const supabase = getServiceSupabase();
    const { data: attempt } = await supabase
      .from("attempts")
      .select("id, verify_code, status, submitted_at, exams(title, checkpoint_hash)")
      .eq("id", attemptId)
      .maybeSingle();

    if (!attempt) throw new HttpError(404, "Attempt not found");

    const [{ data: answers }, { data: events }, { data: lockEvents }] = await Promise.all([
      supabase
        .from("answers")
        .select("*")
        .eq("attempt_id", attemptId)
        .order("client_seq", { ascending: true }),
      supabase
        .from("events")
        .select("*")
        .eq("attempt_id", attemptId)
        .order("seq", { ascending: true }),
      supabase
        .from("lock_events")
        .select("*")
        .eq("attempt_id", attemptId)
        .order("seq", { ascending: true }),
    ]);

    const answersChain = verifyAnswerChain(
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

    const eventsChain = verifyEventChain(
      (events ?? []).map((e) => ({
        attemptId: e.attempt_id,
        seq: e.seq,
        type: e.type,
        meta: (e.meta ?? {}) as Record<string, unknown>,
        at: e.at,
        prevHash: e.prev_hash,
        hash: e.hash,
      }))
    );

    const lockEventsChain = verifyEventChain(
      (lockEvents ?? []).map((l) => ({
        attemptId: l.attempt_id,
        seq: l.seq,
        type: l.type,
        actorId: l.actor_id,
        meta: (l.meta ?? {}) as Record<string, unknown>,
        at: l.at,
        prevHash: l.prev_hash,
        hash: l.hash,
      }))
    );

    const exam = (Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams) as {
      title: string;
      checkpoint_hash: string | null;
    };

    const valid = answersChain.valid && eventsChain.valid && lockEventsChain.valid;

    return jsonOk({
      attemptId: attempt.id,
      verifyCode: attempt.verify_code,
      examTitle: exam?.title ?? "",
      status: attempt.status,
      valid,
      answersChain,
      eventsChain,
      lockEventsChain,
      examCheckpointHash: exam?.checkpoint_hash ?? null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
