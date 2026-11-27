import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk, requireAuth } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { GENESIS_HASH, hashEventRecord } from "@/lib/server/chain";
import { logLockEventSchema, uuidSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

/**
 * Hash-chained soft-lock event log (Section 10.2).
 * Escalating response: OK -> WARN (1) -> FLAGGED (2-3) -> ALERT_EXAMINER (4+).
 * NEVER auto-fails a candidate!
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(req);
    const { id: attemptId } = await context.params;
    if (!uuidSchema.safeParse(attemptId).success) throw new HttpError(400, "Invalid attempt ID");

    const body = await req.json();
    const parsed = logLockEventSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid lock event payload", parsed.error.flatten());
    }

    const supabase = getServiceSupabase();
    const { data: attempt } = await supabase
      .from("attempts")
      .select("id, candidate_id")
      .eq("id", attemptId)
      .maybeSingle();

    if (!attempt) throw new HttpError(404, "Attempt not found");
    if (attempt.candidate_id !== user.id) throw new HttpError(403, "Forbidden");

    const { data: lastRow } = await supabase
      .from("lock_events")
      .select("seq, hash")
      .eq("attempt_id", attemptId)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();

    const seq = (lastRow?.seq ?? 0) + 1;
    const prevHash = lastRow?.hash ?? GENESIS_HASH;
    const atIso = new Date().toISOString();

    const hash = hashEventRecord(prevHash, {
      attemptId,
      seq,
      type: parsed.data.type,
      actorId: user.id,
      meta: parsed.data.meta,
      at: atIso,
    });

    const { data: created, error } = await supabase
      .from("lock_events")
      .insert({
        attempt_id: attemptId,
        type: parsed.data.type,
        actor_id: user.id,
        meta: parsed.data.meta,
        at: atIso,
        seq,
        prev_hash: prevHash,
        hash,
      })
      .select("*")
      .single();

    if (error) throw new HttpError(500, error.message);

    // Count violations for escalating response
    const { count: violationCount } = await supabase
      .from("lock_events")
      .select("*", { count: "exact", head: true })
      .eq("attempt_id", attemptId)
      .eq("type", "VIOLATION");

    const v = violationCount ?? 0;
    const escalation =
      v === 0 ? "OK" : v === 1 ? "WARN" : v <= 3 ? "FLAGGED" : "ALERT_EXAMINER";

    return jsonOk(
      {
        lockEvent: created,
        violationCount: v,
        escalation,
        disclaimer: "Logged as an integrity indicator for review, not proof.",
      },
      201
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
