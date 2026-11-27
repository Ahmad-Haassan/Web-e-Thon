import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk, requireAuth } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { GENESIS_HASH, hashEventRecord, hashUnlockCode } from "@/lib/server/chain";
import { logAudit } from "@/lib/server/audit";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { redeemUnlockCodeSchema, uuidSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

/**
 * Candidate redeems a one-time emergency unlock/resume code (Section 10.3).
 * Timer keeps running by default unless the examiner explicitly set grantExtraSec > 0.
 * Logged in hash-chained lock_events AND audit_logs with the issuing actor's ID.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(req);
    const { id: attemptId } = await context.params;
    if (!uuidSchema.safeParse(attemptId).success) throw new HttpError(400, "Invalid attempt ID");

    enforceRateLimit(`unlock-redeem:${user.id}`, 10, 60_000);

    const body = await req.json();
    const parsed = redeemUnlockCodeSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid unlock code format");
    }

    const supabase = getServiceSupabase();
    const { data: attempt } = await supabase
      .from("attempts")
      .select("id, candidate_id, deadline_at, status")
      .eq("id", attemptId)
      .maybeSingle();

    if (!attempt) throw new HttpError(404, "Attempt not found");
    if (attempt.candidate_id !== user.id) throw new HttpError(403, "Forbidden");

    const codeHash = hashUnlockCode(parsed.data.code);
    const nowIso = new Date().toISOString();

    const { data: codeRow } = await supabase
      .from("unlock_codes")
      .select("*")
      .eq("attempt_id", attemptId)
      .eq("code_hash", codeHash)
      .is("used_at", null)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!codeRow) {
      throw new HttpError(400, "Invalid, expired, or already-used emergency unlock code");
    }

    // Mark code consumed atomically
    const { data: consumed } = await supabase
      .from("unlock_codes")
      .update({ used_at: nowIso })
      .eq("id", codeRow.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();

    if (!consumed) {
      throw new HttpError(400, "Unlock code already used");
    }

    let nextDeadlineAt = attempt.deadline_at;
    if (Number(codeRow.grant_extra_sec) > 0) {
      const extendedMs =
        new Date(attempt.deadline_at).getTime() + Number(codeRow.grant_extra_sec) * 1000;
      nextDeadlineAt = new Date(extendedMs).toISOString();
      await supabase
        .from("attempts")
        .update({ deadline_at: nextDeadlineAt })
        .eq("id", attemptId);
    }

    // Append to hash-chained lock_events
    const { data: lastRow } = await supabase
      .from("lock_events")
      .select("seq, hash")
      .eq("attempt_id", attemptId)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();

    const seq = (lastRow?.seq ?? 0) + 1;
    const prevHash = lastRow?.hash ?? GENESIS_HASH;
    const meta = {
      unlockCodeId: codeRow.id,
      reason: codeRow.reason,
      grantExtraSec: codeRow.grant_extra_sec,
    };

    const hash = hashEventRecord(prevHash, {
      attemptId,
      seq,
      type: "UNLOCK",
      actorId: codeRow.issued_by,
      meta,
      at: nowIso,
    });

    const { data: lockEvent } = await supabase
      .from("lock_events")
      .insert({
        attempt_id: attemptId,
        type: "UNLOCK",
        actor_id: codeRow.issued_by,
        meta,
        at: nowIso,
        seq,
        prev_hash: prevHash,
        hash,
      })
      .select("*")
      .single();

    await logAudit({
      actorId: codeRow.issued_by,
      action: "EMERGENCY_UNLOCK",
      entity: "attempts",
      entityId: attemptId,
      before: { deadlineAt: attempt.deadline_at },
      after: { deadlineAt: nextDeadlineAt, grantExtraSec: codeRow.grant_extra_sec, reason: codeRow.reason },
    });

    return jsonOk({
      ok: true,
      deadlineAt: nextDeadlineAt,
      grantExtraSec: codeRow.grant_extra_sec,
      lockEvent,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
