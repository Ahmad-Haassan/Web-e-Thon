import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk, requireRole } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { logAudit } from "@/lib/server/audit";
import { createUserSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["ADMIN"]);
    const supabase = getServiceSupabase();
    const role = req.nextUrl.searchParams.get("role");
    const search = req.nextUrl.searchParams.get("search");

    let query = supabase.from("users").select("*").order("created_at", { ascending: false });
    if (role && ["ADMIN", "EXAMINER", "CANDIDATE"].includes(role)) {
      query = query.eq("role", role);
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw new HttpError(500, error.message);
    return jsonOk({ users: data ?? [] });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireRole(req, ["ADMIN"]);
    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid user payload", parsed.error.flatten());
    }

    const { name, email, password, role, invite } = parsed.data;
    const supabase = getServiceSupabase();

    let supabaseUserId: string;
    if (invite || !password) {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { name },
      });
      if (error || !data.user) {
        throw new HttpError(400, error?.message ?? "Failed to invite user");
      }
      supabaseUserId = data.user.id;
      await supabase.auth.admin.updateUserById(supabaseUserId, {
        app_metadata: { role },
      });
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
        app_metadata: { role },
      });
      if (error || !data.user) {
        throw new HttpError(400, error?.message ?? "Failed to create auth user");
      }
      supabaseUserId = data.user.id;
    }

    const { data: created, error: dbErr } = await supabase
      .from("users")
      .upsert(
        {
          supabase_user_id: supabaseUserId,
          email,
          name,
          role,
          active: true,
        },
        { onConflict: "supabase_user_id" }
      )
      .select("*")
      .single();

    if (dbErr) throw new HttpError(500, dbErr.message);

    await logAudit({
      actorId: admin.id,
      action: invite ? "USER_INVITED" : "USER_CREATED",
      entity: "users",
      entityId: created.id,
      after: { email, role },
    });

    return jsonOk({ user: created }, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
