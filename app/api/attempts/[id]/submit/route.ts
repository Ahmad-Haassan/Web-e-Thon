import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk, requireAuth } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { recomputeAttemptGrading } from "@/lib/server/grading";
import { logAudit } from "@/lib/server/audit";
import { uuidSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

/**
 * Idempotent exam submit (Section 5.5 + Test Plan):
 * Double-submitting returns the exact same submitted attempt without duplicating anything.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(req);
    const { id: attemptId } = await context.params;
    if (!uuidSchema.safeParse(attemptId).success) throw new HttpError(400, "Invalid attempt ID");

    const supabase = getServiceSupabase();
    const { data: attempt } = await supabase
      .from("attempts")
      .select("*, exams(grace_sec, results_published)")
      .eq("id", attemptId)
      .maybeSingle();

    if (!attempt) throw new HttpError(404, "Attempt not found");
    if (attempt.candidate_id !== user.id) {
      throw new HttpError(403, "Forbidden: you do not own this attempt");
    }

    const examRel = Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams;
    const resultsPublished = Boolean(
      (examRel as { results_published?: boolean } | null)?.results_published
    );

    // Idempotent: if already submitted/expired/graded, just return current state
    if (attempt.status !== "IN_PROGRESS") {
      return jsonOk({
        idempotent: true,
        attempt: {
          id: attempt.id,
          status: attempt.status,
          submittedAt: attempt.submitted_at,
          score: resultsPublished || attempt.is_sandbox ? attempt.score : null,
          maxScore: Number(attempt.max_score),
          verifyCode: attempt.verify_code,
        },
      });
    }

    const nowIso = new Date().toISOString();
    const { data: transitioned } = await supabase
      .from("attempts")
      .update({ status: "SUBMITTED", submitted_at: nowIso, last_seen_at: nowIso })
      .eq("id", attemptId)
      .eq("status", "IN_PROGRESS")
      .select("*")
      .maybeSingle();

    if (!transitioned) {
      // Another concurrent submit won the race — return idempotently
      const { data: latest } = await supabase
        .from("attempts")
        .select("*")
        .eq("id", attemptId)
        .single();
      return jsonOk({
        idempotent: true,
        attempt: {
          id: latest.id,
          status: latest.status,
          submittedAt: latest.submitted_at,
          score: resultsPublished || latest.is_sandbox ? latest.score : null,
          maxScore: Number(latest.max_score),
          verifyCode: latest.verify_code,
        },
      });
    }

    const graded = await recomputeAttemptGrading(supabase, attemptId);

    const { data: examCheckpoint } = await supabase
      .from("exams")
      .select("checkpoint_hash")
      .eq("id", attempt.exam_id)
      .single();

    await logAudit({
      actorId: user.id,
      action: "ATTEMPT_SUBMITTED",
      entity: "attempts",
      entityId: attemptId,
      after: { status: graded.status, isSandbox: attempt.is_sandbox },
    });

    return jsonOk({
      idempotent: false,
      attempt: {
        id: attemptId,
        status: graded.status,
        submittedAt: nowIso,
        score: resultsPublished || attempt.is_sandbox ? graded.score : null,
        maxScore: graded.maxScore,
        pendingManualCount: graded.pendingManualCount,
        verifyCode: attempt.verify_code,
      },
      checkpointHash: examCheckpoint?.checkpoint_hash ?? null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
