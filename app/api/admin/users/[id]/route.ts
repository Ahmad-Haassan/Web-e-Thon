import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk, requireRole } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { logAudit } from "@/lib/server/audit";
import { updateUserSchema, uuidSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireRole(req, ["ADMIN"]);
    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) throw new HttpError(400, "Invalid user ID");

    const body = await req.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid update payload", parsed.error.flatten());
    }

    const supabase = getServiceSupabase();
    const { data: before } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
    if (!before) throw new HttpError(404, "User not found");

    const { data: updated, error } = await supabase
      .from("users")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw new HttpError(500, error.message);

    if (parsed.data.role && before.supabase_user_id) {
      await supabase.auth.admin.updateUserById(before.supabase_user_id, {
        app_metadata: { role: parsed.data.role },
      });
    }

    await logAudit({
      actorId: admin.id,
      action: "USER_UPDATED",
      entity: "users",
      entityId: id,
      before: { role: before.role, active: before.active, name: before.name },
      after: { role: updated.role, active: updated.active, name: updated.name },
    });

    return jsonOk({ user: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireRole(req, ["ADMIN"]);
    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) throw new HttpError(400, "Invalid user ID");
    if (id === admin.id) throw new HttpError(400, "Cannot deactivate your own admin account");

    const permanent = req.nextUrl.searchParams.get("permanent") === "true";
    const supabase = getServiceSupabase();

    if (permanent) {
      const { data: target } = await supabase
        .from("users")
        .select("id, supabase_user_id, email")
        .eq("id", id)
        .maybeSingle();

      if (!target) throw new HttpError(404, "User not found");

      const { error: delErr } = await supabase.from("users").delete().eq("id", id);
      if (delErr) throw new HttpError(500, delErr.message);

      if (target.supabase_user_id) {
        await supabase.auth.admin.deleteUser(target.supabase_user_id).catch(() => {});
      }

      await logAudit({
        actorId: admin.id,
        action: "USER_APPROVAL_REJECTED",
        entity: "users",
        entityId: id,
        before: { email: target.email },
      });

      return jsonOk({ ok: true, deleted: true });
    }

    const { data: updated, error } = await supabase
      .from("users")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) throw new HttpError(500, error.message);
    if (!updated) throw new HttpError(404, "User not found");

    await logAudit({
      actorId: admin.id,
      action: "USER_DEACTIVATED",
      entity: "users",
      entityId: id,
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
