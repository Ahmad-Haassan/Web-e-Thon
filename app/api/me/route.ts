import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk, requireAuth } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { logAudit } from "@/lib/server/audit";
import { updateProfileSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req, { allowInactive: true });
    return jsonOk({ user, pendingApproval: !user.active });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid profile fields", parsed.error.flatten());
    }

    const d = parsed.data;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (d.name !== undefined) patch.name = d.name;
    if (d.phone !== undefined) patch.phone = d.phone || null;
    if (d.className !== undefined) patch.class_name = d.className || null;
    if (d.section !== undefined) patch.section = d.section || null;

    const supabase = getServiceSupabase();
    const { data: updated, error } = await supabase
      .from("users")
      .update(patch)
      .eq("id", user.id)
      .select("*")
      .single();

    if (error || !updated) {
      throw new HttpError(500, error?.message ?? "Failed to update profile");
    }

    await logAudit({
      actorId: user.id,
      action: "PROFILE_UPDATED",
      entity: "users",
      entityId: user.id,
      before: {
        name: user.name,
        phone: user.phone ?? null,
        class_name: user.class_name ?? null,
        section: user.section ?? null,
      },
      after: {
        name: updated.name,
        phone: updated.phone ?? null,
        class_name: updated.class_name ?? null,
        section: updated.section ?? null,
      },
    });

    return jsonOk({
      user: {
        ...updated,
        email_verified: Boolean(updated.email_verified ?? user.email_verified),
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
