import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk, requireAuth } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { GENESIS_HASH, hashAnswerRecord, signReceipt } from "@/lib/server/chain";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { syncAnswersSchema, uuidSchema } from "@/lib/shared/schemas";
import type { ServerPaperSnapshot, SignedReceipt } from "@/lib/shared/types";

export const runtime = "nodejs";

/**
 * Failure-resilient, idempotent offline answer sync (Innovation 5.3 + Section 10.5):
 * - Deduplicates by unique (attempt_id, client_seq) -> returns existing receipt safely.
 * - Validates against SERVER deadline + graceSec (never extends deadline automatically!).
 * - Appends each answer into an immutable SHA-256 hash chain and issues an HMAC-signed receipt.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(req);
    const { id: attemptId } = await context.params;
    if (!uuidSchema.safeParse(attemptId).success) throw new HttpError(400, "Invalid attempt ID");

    enforceRateLimit(`answers:${user.id}`, 120, 60_000);

    const body = await req.json();
    const parsed = syncAnswersSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid answer sync payload", parsed.error.flatten());
    }

    const supabase = getServiceSupabase();
    const { data: attempt, error: attErr } = await supabase
      .from("attempts")
      .select("*, exams(grace_sec)")
      .eq("id", attemptId)
      .maybeSingle();

    if (attErr) throw new HttpError(500, attErr.message);
    if (!attempt) throw new HttpError(404, "Attempt not found");
    if (attempt.candidate_id !== user.id) {
      throw new HttpError(403, "Forbidden: you do not own this attempt");
    }

    // Single-active-session soft check (Section 10.2)
    if (
      parsed.data.sessionToken &&
      attempt.active_session_token &&
      parsed.data.sessionToken !== attempt.active_session_token
    ) {
      throw new HttpError(
        409,
        "Another session is active for this attempt. Refresh to reclaim this session."
      );
    }

    const examRel = Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams;
    const graceSec = Number((examRel as { grace_sec?: number } | null)?.grace_sec ?? 15);
    const cutoffMs = new Date(attempt.deadline_at).getTime() + graceSec * 1000;

    const snapshot = attempt.paper_snapshot as ServerPaperSnapshot;
    const validQuestionIds = new Set((snapshot.questions ?? []).map((q) => q.id));

    // Sort incoming batch by clientSeq ascending so chain ordering is deterministic
    const sorted = [...parsed.data.answers].sort((a, b) => a.clientSeq - b.clientSeq);

    // Fetch current chain tail
    const { data: tailRow } = await supabase
      .from("answers")
      .select("hash, client_seq")
      .eq("attempt_id", attemptId)
      .order("client_seq", { ascending: false })
      .limit(1)
      .maybeSingle();

    let prevHash = tailRow?.hash ?? GENESIS_HASH;
    const receipts: SignedReceipt[] = [];

    for (const item of sorted) {
      if (!validQuestionIds.has(item.questionId)) {
        throw new HttpError(400, `Question ${item.questionId} does not belong to this attempt`);
      }

      // Idempotency check: if clientSeq already recorded, return existing signed receipt
      const { data: existing } = await supabase
        .from("answers")
        .select("id, hash, client_seq, received_at, receipt_sig, accepted, reject_reason")
        .eq("attempt_id", attemptId)
        .eq("client_seq", item.clientSeq)
        .maybeSingle();

      if (existing) {
        receipts.push({
          attemptId,
          answerHash: existing.hash,
          clientSeq: existing.client_seq,
          serverTime: existing.received_at,
          sig: existing.receipt_sig,
          accepted: existing.accepted,
          rejectReason: existing.reject_reason,
        });
        continue;
      }

      const nowIso = new Date().toISOString();
      const nowMs = Date.parse(nowIso);

      let accepted = true;
      let rejectReason: string | null = null;

      if (attempt.status !== "IN_PROGRESS") {
        accepted = false;
        rejectReason = "ATTEMPT_CLOSED";
      } else if (nowMs > cutoffMs) {
        accepted = false;
        rejectReason = "PAST_DEADLINE";
      }

      const hash = hashAnswerRecord(prevHash, {
        attemptId,
        questionId: item.questionId,
        selected: item.selected,
        marked: item.marked,
        clientSeq: item.clientSeq,
        receivedAt: nowIso,
        accepted,
      });

      const sig = signReceipt(hash, item.clientSeq, nowIso);

      const { data: inserted, error: insErr } = await supabase
        .from("answers")
        .insert({
          attempt_id: attemptId,
          question_id: item.questionId,
          selected: item.selected,
          marked: item.marked,
          saved_at: item.savedAt,
          received_at: nowIso,
          client_seq: item.clientSeq,
          accepted,
          reject_reason: rejectReason,
          prev_hash: prevHash,
          hash,
          receipt_sig: sig,
        })
        .select("id")
        .single();

      if (insErr) {
        // Handle concurrent duplicate clientSeq gracefully
        if (insErr.code === "23505") {
          const { data: dup } = await supabase
            .from("answers")
            .select("hash, client_seq, received_at, receipt_sig, accepted, reject_reason")
            .eq("attempt_id", attemptId)
            .eq("client_seq", item.clientSeq)
            .single();
          if (dup) {
            receipts.push({
              attemptId,
              answerHash: dup.hash,
              clientSeq: dup.client_seq,
              serverTime: dup.received_at,
              sig: dup.receipt_sig,
              accepted: dup.accepted,
              rejectReason: dup.reject_reason,
            });
          }
          continue;
        }
        throw new HttpError(500, insErr.message);
      }

      await supabase.from("receipts").upsert(
        {
          attempt_id: attemptId,
          answer_id: inserted.id,
          answer_hash: hash,
          client_seq: item.clientSeq,
          server_time: nowIso,
          sig,
        },
        { onConflict: "attempt_id,client_seq" }
      );

      prevHash = hash;
      receipts.push({
        attemptId,
        answerHash: hash,
        clientSeq: item.clientSeq,
        serverTime: nowIso,
        sig,
        accepted,
        rejectReason,
      });
    }

    await supabase
      .from("attempts")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", attemptId);

    return jsonOk({ receipts, serverNow: Date.now() });
  } catch (err) {
    return handleRouteError(err);
  }
}
