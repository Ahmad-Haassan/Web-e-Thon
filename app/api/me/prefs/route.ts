import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk, requireAuth } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { workspacePrefsSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const parsed = workspacePrefsSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid workspace preferences", parsed.error.flatten());
    }

    const nextPrefs = { ...(user.prefs ?? {}), ...parsed.data };
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("users")
      .update({ prefs: nextPrefs, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select("prefs")
      .single();

    if (error) throw new HttpError(500, error.message);
    return jsonOk({ prefs: data.prefs });
  } catch (err) {
    return handleRouteError(err);
  }
}
