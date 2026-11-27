import { NextRequest } from "next/server";
import {
  assertExamOwnership,
  handleRouteError,
  HttpError,
  jsonOk,
  requireAuth,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { GENESIS_HASH, hashEventRecord } from "@/lib/server/chain";
import { logEventSchema, uuidSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

/**
 * Hash-chained event logger for integrity indicators (TAB_BLUR, FULLSCREEN_EXIT, PASTE),
 * resilience telemetry (DISCONNECT, RECONNECT with duration), and examiner TECHNICAL_INCIDENT notes.
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
    const parsed = logEventSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid event payload", parsed.error.flatten());
    }

    const supabase = getServiceSupabase();
    const { data: attempt } = await supabase
      .from("attempts")
      .select("id, candidate_id, exams(owner_id)")
      .eq("id", attemptId)
      .maybeSingle();

    if (!attempt) throw new HttpError(404, "Attempt not found");

    const exam = (Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams) as {
      owner_id: string;
    };

    if (user.role === "CANDIDATE") {
      if (attempt.candidate_id !== user.id) throw new HttpError(403, "Forbidden");
      if (parsed.data.type === "TECHNICAL_INCIDENT") {
        throw new HttpError(403, "Only examiners can log verified technical incidents");
      }
    } else {
      assertExamOwnership(user, exam);
    }

    const { data: lastEvent } = await supabase
      .from("events")
      .select("seq, hash")
      .eq("attempt_id", attemptId)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();

    const seq = (lastEvent?.seq ?? 0) + 1;
    const prevHash = lastEvent?.hash ?? GENESIS_HASH;
    const atIso = new Date().toISOString();
    const meta = {
      ...parsed.data.meta,
      ...(parsed.data.at ? { clientAt: parsed.data.at } : {}),
      loggedByRole: user.role,
    };

    const hash = hashEventRecord(prevHash, {
      attemptId,
      seq,
      type: parsed.data.type,
      meta,
      at: atIso,
    });

    const { data: created, error } = await supabase
      .from("events")
      .insert({
        attempt_id: attemptId,
        type: parsed.data.type,
        meta,
        at: atIso,
        seq,
        prev_hash: prevHash,
        hash,
      })
      .select("*")
      .single();

    if (error) throw new HttpError(500, error.message);

    await supabase
      .from("attempts")
      .update({ last_seen_at: atIso })
      .eq("id", attemptId);

    return jsonOk({ event: created }, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
