import { NextRequest } from "next/server";
import {
  assertExamOwnership,
  handleRouteError,
  HttpError,
  jsonOk,
  requireRole,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { generateOneTimeUnlockCode } from "@/lib/server/chain";
import { logAudit } from "@/lib/server/audit";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { createUnlockCodeSchema, uuidSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

/**
 * Examiner/Admin issues a one-time, short-lived (~2 min) emergency unlock/resume code
 * bound to a single attempt. Stored hashed; plaintext shown once (Section 10.3).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const { id: attemptId } = await context.params;
    if (!uuidSchema.safeParse(attemptId).success) throw new HttpError(400, "Invalid attempt ID");

    enforceRateLimit(`unlock-issue:${actor.id}`, 30, 60_000);

    const body = await req.json();
    const parsed = createUnlockCodeSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid unlock code request", parsed.error.flatten());
    }

    const supabase = getServiceSupabase();
    const { data: attempt } = await supabase
      .from("attempts")
      .select("id, status, exams(owner_id)")
      .eq("id", attemptId)
      .maybeSingle();

    if (!attempt) throw new HttpError(404, "Attempt not found");

    const exam = (Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams) as {
      owner_id: string;
    };
    assertExamOwnership(actor, exam);

    const { plainCode, codeHash } = generateOneTimeUnlockCode();
    const expiresAt = new Date(Date.now() + parsed.data.expiresInSec * 1000).toISOString();

    const { data: created, error } = await supabase
      .from("unlock_codes")
      .insert({
        attempt_id: attemptId,
        issued_by: actor.id,
        code_hash: codeHash,
        reason: parsed.data.reason,
        grant_extra_sec: parsed.data.grantExtraSec,
        expires_at: expiresAt,
      })
      .select("id, expires_at, grant_extra_sec, reason")
      .single();

    if (error) throw new HttpError(500, error.message);

    await logAudit({
      actorId: actor.id,
      action: "EMERGENCY_UNLOCK_CODE_ISSUED",
      entity: "unlock_codes",
      entityId: created.id,
      after: {
        attemptId,
        reason: parsed.data.reason,
        grantExtraSec: parsed.data.grantExtraSec,
        expiresAt,
      },
    });

    return jsonOk(
      {
        id: created.id,
        code: plainCode, // returned ONCE; never stored in plaintext
        expiresAt: created.expires_at,
        grantExtraSec: created.grant_extra_sec,
      },
      201
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
