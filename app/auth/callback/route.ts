import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthSupabase } from "@/lib/server/supabase";

export const runtime = "nodejs";

/**
 * Handles Supabase OAuth PKCE redirects (e.g. Google / Gmail sign-in).
 * Exchanges the temporary `code` for a session cookie and redirects the user
 * to their requested destination or `/dashboard` (which routes by role).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  if (oauthError) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", oauthError);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", "Missing OAuth authorization code. Please try signing in again.");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const supabase = await getRequestAuthSupabase();
    const { data: exchanged, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const loginUrl = new URL("/login", url.origin);
      loginUrl.searchParams.set("error", error.message);
      return NextResponse.redirect(loginUrl);
    }

    // Check whether this OAuth user was newly created; if so, place in Admin Approval queue
    const authUser = exchanged.user;
    if (authUser?.email) {
      const { getServiceSupabase } = await import("@/lib/server/supabase");
      const { logAudit } = await import("@/lib/server/audit");
      const service = getServiceSupabase();

      const { data: existing } = await service
        .from("users")
        .select("id, active, created_at")
        .eq("supabase_user_id", authUser.id)
        .maybeSingle();

      // If created within the last 15 seconds by the DB trigger with active=true, set active=false for Admin approval
      const createdRecently =
        existing &&
        Date.now() - new Date(existing.created_at).getTime() < 15_000;

      if (!existing) {
        const displayName =
          (typeof authUser.user_metadata?.full_name === "string" && authUser.user_metadata.full_name) ||
          (typeof authUser.user_metadata?.name === "string" && authUser.user_metadata.name) ||
          authUser.email.split("@")[0];

        const { data: inserted } = await service
          .from("users")
          .insert({
            supabase_user_id: authUser.id,
            email: authUser.email.toLowerCase(),
            name: displayName,
            role: "CANDIDATE",
            active: false,
          })
          .select("id")
          .single();

        await logAudit({
          actorId: inserted?.id ?? null,
          action: "APPROVAL_REQUESTED",
          entity: "users",
          entityId: inserted?.id ?? null,
          after: { email: authUser.email.toLowerCase(), provider: "google" },
        });
        return NextResponse.redirect(new URL("/pending-approval", url.origin));
      }

      if (createdRecently && existing.active) {
        await service.from("users").update({ active: false }).eq("id", existing.id);
        await logAudit({
          actorId: existing.id,
          action: "APPROVAL_REQUESTED",
          entity: "users",
          entityId: existing.id,
          after: { email: authUser.email.toLowerCase(), provider: "google" },
        });
        return NextResponse.redirect(new URL("/pending-approval", url.origin));
      }

      if (!existing.active) {
        return NextResponse.redirect(new URL("/pending-approval", url.origin));
      }
    }

    return NextResponse.redirect(new URL(safeNext, url.origin));
  } catch (err) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set(
      "error",
      err instanceof Error ? err.message : "Failed to complete Google sign-in."
    );
    return NextResponse.redirect(loginUrl);
  }
}
