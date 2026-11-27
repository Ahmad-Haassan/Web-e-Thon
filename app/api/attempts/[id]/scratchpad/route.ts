import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk, requireAuth } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { saveScratchpadSchema, uuidSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

export async function GET(
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
      .select("id, candidate_id")
      .eq("id", attemptId)
      .maybeSingle();

    if (!attempt) throw new HttpError(404, "Attempt not found");
    if (attempt.candidate_id !== user.id) throw new HttpError(403, "Forbidden");

    const { data } = await supabase
      .from("scratchpads")
      .select("*")
      .eq("attempt_id", attemptId)
      .maybeSingle();

    return jsonOk({
      scratchpad: data ?? { attempt_id: attemptId, text_content: "", drawing_json: [] },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(req);
    const { id: attemptId } = await context.params;
    if (!uuidSchema.safeParse(attemptId).success) throw new HttpError(400, "Invalid attempt ID");

    const body = await req.json();
    const parsed = saveScratchpadSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid scratchpad payload", parsed.error.flatten());
    }

    const supabase = getServiceSupabase();
    const { data: attempt } = await supabase
      .from("attempts")
      .select("id, candidate_id")
      .eq("id", attemptId)
      .maybeSingle();

    if (!attempt) throw new HttpError(404, "Attempt not found");
    if (attempt.candidate_id !== user.id) throw new HttpError(403, "Forbidden");

    const { data, error } = await supabase
      .from("scratchpads")
      .upsert(
        {
          attempt_id: attemptId,
          text_content: parsed.data.textContent,
          drawing_json: parsed.data.drawingJson,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "attempt_id" }
      )
      .select("*")
      .single();

    if (error) throw new HttpError(500, error.message);
    return jsonOk({ scratchpad: data });
  } catch (err) {
    return handleRouteError(err);
  }
}
