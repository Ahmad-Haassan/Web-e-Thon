import { NextRequest } from "next/server";
import { z } from "zod";
import { handleRouteError, HttpError, jsonOk } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { logAudit } from "@/lib/server/audit";
import { enforceRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

const gmailRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(120).optional(),
  password: z.string().min(6).max(128),
  requestedRole: z.enum(["ADMIN", "EXAMINER", "CANDIDATE"]).optional().default("CANDIDATE"),
});

/**
 * Handles Gmail registration / approval requests:
 * - If the email already exists in public.users:
 *     returns { exists: true, active: existing.active } so the client signs in normally.
 * - If the email is NOT registered yet:
 *     creates a Supabase Auth user (email_confirm: true so they can sign in right away)
 *     and ensures public.users has `active: false` (Waiting for Admin Approval!),
 *     logs APPROVAL_REQUESTED in audit_logs, and returns { created: true, pendingApproval: true }.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    enforceRateLimit(`gmail-req:${ip}`, 20, 60_000);

    const body = await req.json();
    const parsed = gmailRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Please enter a valid email and password (min 6 characters)", parsed.error.flatten());
    }

    const email = parsed.data.email.trim().toLowerCase();
    const name = parsed.data.name?.trim() || email.split("@")[0];
    const requestedRole = parsed.data.requestedRole;
    const supabase = getServiceSupabase();

    // Check if already registered in public.users
    const { data: existing } = await supabase
      .from("users")
      .select("id, active, role")
      .ilike("email", email)
      .maybeSingle();

    if (existing) {
      return jsonOk({
        exists: true,
        active: existing.active,
        pendingApproval: !existing.active,
      });
    }

    // Create auth account (confirm email immediately so they can reach /pending-approval)
    let authUserId: string;
    const { data: createdAuth, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { name, requested_role: requestedRole },
      app_metadata: { role: requestedRole },
    });

    if (authErr || !createdAuth.user) {
      // Check if user existed in auth.users without public.users row
      const { data: list } = await supabase.auth.admin.listUsers({ perPage: 200 });
      const found = list?.users.find((u) => u.email?.toLowerCase() === email);
      if (!found) {
        throw new HttpError(400, authErr?.message ?? "Could not register account");
      }
      authUserId = found.id;
    } else {
      authUserId = createdAuth.user.id;
    }

    // Force active = false (overrides any DB trigger default active = true!)
    const { data: appUser, error: dbErr } = await supabase
      .from("users")
      .upsert(
        {
          supabase_user_id: authUserId,
          email,
          name,
          role: requestedRole,
          active: false,
        },
        { onConflict: "supabase_user_id" }
      )
      .select("id, email, name, role, active")
      .single();

    if (dbErr || !appUser) {
      throw new HttpError(500, dbErr?.message ?? "Failed to queue approval request");
    }

    await logAudit({
      actorId: appUser.id,
      action: "APPROVAL_REQUESTED",
      entity: "users",
      entityId: appUser.id,
      after: { email, name, requestedRole, active: false },
    });

    return jsonOk(
      {
        exists: false,
        created: true,
        pendingApproval: true,
        user: appUser,
      },
      201
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
