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
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const loginUrl = new URL("/login", url.origin);
      loginUrl.searchParams.set("error", error.message);
      return NextResponse.redirect(loginUrl);
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
