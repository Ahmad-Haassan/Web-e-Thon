import { NextRequest, NextResponse } from "next/server";
import type { AppUser, ComputedExamLifecycle, UserRole } from "@/lib/shared/types";
import { getRequestAuthSupabase, getServiceSupabase } from "./supabase";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function handleRouteError(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json(
      { error: err.message, ...(err.details !== undefined ? { details: err.details } : {}) },
      { status: err.status }
    );
  }
  console.error("[API ERROR]", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/**
 * Verifies the Supabase session (via Authorization Bearer token OR SSR cookies),
 * resolves the app user in public.users, lazily creates CANDIDATE row on first login,
 * and blocks deactivated users (active = false).
 */
export async function requireAuth(req: NextRequest): Promise<AppUser> {
  const service = getServiceSupabase();
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  let authUser: {
    id: string;
    email?: string;
    email_confirmed_at?: string | null;
    user_metadata?: Record<string, unknown>;
  } | null = null;

  if (bearerToken) {
    const { data, error } = await service.auth.getUser(bearerToken);
    if (error || !data.user) {
      throw new HttpError(401, "Invalid or expired authentication token");
    }
    authUser = data.user;
  } else {
    const ssr = await getRequestAuthSupabase();
    const { data, error } = await ssr.auth.getUser();
    if (error || !data.user) {
      throw new HttpError(401, "Authentication required");
    }
    authUser = data.user;
  }

  let { data: appUser, error: findErr } = await service
    .from("users")
    .select("*")
    .eq("supabase_user_id", authUser.id)
    .maybeSingle();

  if (findErr) {
    throw new HttpError(500, "Failed to load user profile");
  }

  const isEmailConfirmed = Boolean(authUser.email_confirmed_at);

  if (!appUser) {
    // Self-registration ALWAYS creates CANDIDATE only (never trust user_metadata for role)
    const fallbackName =
      typeof authUser.user_metadata?.name === "string" && authUser.user_metadata.name.trim()
        ? authUser.user_metadata.name.trim()
        : (authUser.email?.split("@")[0] ?? "Candidate");

    const metaPhone =
      typeof authUser.user_metadata?.phone === "string" && authUser.user_metadata.phone.trim()
        ? authUser.user_metadata.phone.trim()
        : null;
    const metaClass =
      typeof authUser.user_metadata?.className === "string" && authUser.user_metadata.className.trim()
        ? authUser.user_metadata.className.trim()
        : null;
    const metaSection =
      typeof authUser.user_metadata?.section === "string" && authUser.user_metadata.section.trim()
        ? authUser.user_metadata.section.trim()
        : null;

    const { data: created, error: createErr } = await service
      .from("users")
      .insert({
        supabase_user_id: authUser.id,
        email: authUser.email ?? `${authUser.id}@unknown.local`,
        name: fallbackName,
        role: "CANDIDATE",
        active: true,
        phone: metaPhone,
        class_name: metaClass,
        section: metaSection,
        email_verified: isEmailConfirmed,
      })
      .select("*")
      .single();

    if (createErr || !created) {
      throw new HttpError(500, "Failed to initialize user profile");
    }
    appUser = created;
  }

  if (!appUser.active) {
    throw new HttpError(403, "Account is deactivated");
  }

  return {
    ...(appUser as AppUser),
    email_verified: Boolean(appUser.email_verified ?? isEmailConfirmed),
  };
}

export async function requireRole(req: NextRequest, allowed: UserRole[]): Promise<AppUser> {
  const user = await requireAuth(req);
  if (!allowed.includes(user.role)) {
    throw new HttpError(403, "Forbidden: insufficient role permissions");
  }
  return user;
}

export function assertExamOwnership(user: AppUser, exam: { owner_id: string }) {
  if (user.role === "ADMIN") return;
  if (user.role === "EXAMINER" && exam.owner_id === user.id) return;
  throw new HttpError(403, "Forbidden: you do not own this exam");
}

export function computeExamLifecycle(
  exam: { status: "DRAFT" | "PUBLISHED"; start_at: string; end_at: string },
  nowMs = Date.now()
): ComputedExamLifecycle {
  if (exam.status === "DRAFT") return "DRAFT";
  const start = new Date(exam.start_at).getTime();
  const end = new Date(exam.end_at).getTime();
  if (nowMs < start) return "PUBLISHED";
  if (nowMs <= end) return "ONGOING";
  return "COMPLETED";
}
