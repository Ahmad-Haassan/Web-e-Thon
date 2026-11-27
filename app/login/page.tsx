"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { getBrowserSupabase, isSupabaseConfigured } from "@/lib/client/supabase";
import { useAuth, roleHomePath } from "@/hooks/use-auth";
import {
  Button,
  Input,
  Label,
  Spinner,
  ThemeToggleButton,
} from "@/components/ui/primitives";

function GoogleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.56-5.16 3.56-8.86z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.57.38-2.29V6.61H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4 3.1c.95-2.84 3.6-4.96 6.72-4.96z"
      />
    </svg>
  );
}

type LoginRoleTab = "admin" | "examiner" | "student";

const ROLE_CONFIG: Record<
  LoginRoleTab,
  {
    heading: string;
    placeholder: string;
    buttonLabel: string;
    allowRegister: boolean;
    allowGoogle: boolean;
  }
> = {
  admin: {
    heading: "Administrator Sign In",
    placeholder: "admin@exam.edu.pk",
    buttonLabel: "Sign In as Administrator",
    allowRegister: false,
    allowGoogle: true,
  },
  examiner: {
    heading: "Examiner Sign In",
    placeholder: "examiner1@exam.edu.pk",
    buttonLabel: "Sign In as Examiner",
    allowRegister: false,
    allowGoogle: true,
  },
  student: {
    heading: "Student Sign In",
    placeholder: "student1@exam.edu.pk",
    buttonLabel: "Sign In as Student",
    allowRegister: true,
    allowGoogle: true,
  },
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const oauthErrorParam = searchParams.get("error");
  const rawRoleParam = (searchParams.get("role") ?? "").toLowerCase();
  const selectedRole: LoginRoleTab =
    rawRoleParam === "admin" || rawRoleParam === "examiner" || rawRoleParam === "student"
      ? rawRoleParam
      : "student";

  const { user, loading, refreshUser } = useAuth();
  const roleUi = ROLE_CONFIG[selectedRole];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showGmailModal, setShowGmailModal] = useState(false);
  const [gmailName, setGmailName] = useState("");
  const [gmailEmail, setGmailEmail] = useState("");
  const [gmailPassword, setGmailPassword] = useState("");
  const [gmailSubmitting, setGmailSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(oauthErrorParam);

  useEffect(() => {
    if (oauthErrorParam) {
      setError(oauthErrorParam);
    }
  }, [oauthErrorParam]);

  useEffect(() => {
    if (!loading && user) {
      if (!user.active) {
        router.replace("/pending-approval");
      } else {
        router.replace(nextPath && nextPath.startsWith("/") ? nextPath : roleHomePath(user.role));
      }
    }
  }, [user, loading, router, nextPath]);

  async function handleGoogleSignIn() {
    setError(null);
    if (!isSupabaseConfigured()) {
      setError(
        "Supabase environment variables are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
      return;
    }

    setGoogleLoading(true);
    try {
      // Check if Google OAuth provider is enabled on Supabase first
      const settingsRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`,
        { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" } }
      ).catch(() => null);
      const settingsJson = settingsRes?.ok ? await settingsRes.json().catch(() => null) : null;
      const isGoogleProviderEnabled = Boolean(settingsJson?.external?.google);

      if (!isGoogleProviderEnabled) {
        // Fallback: open instant Gmail Sign-In / Approval Request dialog so ANY Gmail works right away!
        setGoogleLoading(false);
        setGmailName("");
        setGmailEmail("");
        setGmailPassword("");
        setShowGmailModal(true);
        return;
      }

      const supabase = getBrowserSupabase();
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      if (nextPath && nextPath.startsWith("/")) {
        callbackUrl.searchParams.set("next", nextPath);
      }

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      if (oauthError) {
        setGoogleLoading(false);
        setShowGmailModal(true);
      }
    } catch {
      setGoogleLoading(false);
      setShowGmailModal(true);
    }
  }

  async function handleGmailRequestSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedEmail = gmailEmail.trim().toLowerCase();
    if (!trimmedEmail.endsWith("@gmail.com") && !trimmedEmail.includes("@")) {
      setError("Please enter a valid Gmail address.");
      return;
    }

    setGmailSubmitting(true);
    try {
      const requestedRole =
        selectedRole === "admin"
          ? "ADMIN"
          : selectedRole === "examiner"
            ? "EXAMINER"
            : "CANDIDATE";

      const res = await fetch("/api/auth/gmail-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          name: gmailName.trim() || undefined,
          password: gmailPassword,
          requestedRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to continue with Gmail");
      }

      // Sign in with Supabase Auth
      const supabase = getBrowserSupabase();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: gmailPassword,
      });

      if (signInErr) {
        throw new Error(
          data.exists
            ? "This Gmail is already registered — please enter your existing password."
            : signInErr.message
        );
      }

      const appUser = await refreshUser();
      setShowGmailModal(false);

      if (!appUser || !appUser.active || data.pendingApproval) {
        toast.info("Request sent! Please wait until an Administrator approves your account.");
        router.replace("/pending-approval");
        return;
      }

      toast.success(`Welcome back, ${appUser.name}`);
      router.replace(nextPath && nextPath.startsWith("/") ? nextPath : roleHomePath(appUser.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gmail sign-in failed");
    } finally {
      setGmailSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isSupabaseConfigured()) {
      setError(
        "Supabase environment variables are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local."
      );
      return;
    }

    setSubmitting(true);
    try {
      const supabase = getBrowserSupabase();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setSubmitting(false);
        return;
      }

      const appUser = await refreshUser();
      if (!appUser) {
        setError("Signed in, but could not load your profile from /api/me.");
        setSubmitting(false);
        return;
      }

      if (!appUser.active) {
        toast.info("Your account is in the Waiting Approval queue.");
        router.replace("/pending-approval");
        return;
      }

      toast.success(`Welcome back, ${appUser.name}`);
      router.replace(nextPath && nextPath.startsWith("/") ? nextPath : roleHomePath(appUser.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Minimal Top-Right Theme Switch */}
      <div className="mx-auto flex w-full max-w-6xl justify-end px-6 pt-5">
        <ThemeToggleButton showLabel />
      </div>

      {/* Centered Single-Role Sign-In Card Only */}
      <main className="mx-auto flex w-full max-w-md flex-1 items-center justify-center px-4 py-10">
        <div className="w-full rounded-[2px] border border-border bg-surface p-7 sm:p-9 surface-elevated animate-fade-rise">
          <h1 className="mb-6 text-center font-display text-2xl font-bold text-foreground">
            {roleUi.heading}
          </h1>

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-[2px] border border-danger/35 bg-danger-soft p-3 text-xs text-danger"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">EMAIL ADDRESS</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder={roleUi.placeholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="password">PASSWORD</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-subtle hover:text-foreground cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" strokeWidth={1.7} />
                  ) : (
                    <Eye className="h-4 w-4" strokeWidth={1.7} />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              {roleUi.allowRegister ? (
                <Link href="/register" className="font-medium text-accent hover:underline">
                  New student? Register
                </Link>
              ) : (
                <Link href="/" className="font-medium text-accent hover:underline">
                  ← Back to Home
                </Link>
              )}
              <Link href="/verify" className="text-ink-muted hover:text-foreground hover:underline">
                Verify Certificate
              </Link>
            </div>

            <Button type="submit" className="w-full h-11 shadow-md" disabled={submitting || googleLoading}>
              {submitting ? (
                <>
                  <Spinner /> Signing In…
                </>
              ) : (
                roleUi.buttonLabel
              )}
            </Button>
          </form>

          {roleUi.allowGoogle && (
            <>
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                  <span className="bg-surface px-3 text-ink-subtle">Or continue with Gmail</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={submitting || googleLoading}
                className="flex h-11 w-full items-center justify-center gap-2.5 rounded-[2px] border border-border-strong bg-surface-subtle px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:opacity-60 cursor-pointer"
              >
                {googleLoading ? (
                  <>
                    <Spinner className="h-4 w-4" />
                    <span>Connecting to Gmail…</span>
                  </>
                ) : (
                  <>
                    <GoogleIcon className="h-4 w-4" />
                    <span>Continue with Google (Gmail)</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </main>

      {/* Instant Gmail Sign-In / Admin Approval Request Modal */}
      {showGmailModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Continue with Gmail"
          onClick={() => setShowGmailModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-fade-rise"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <GoogleIcon className="h-5 w-5" />
                <h2 className="text-base font-bold text-foreground">Continue with Gmail</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowGmailModal(false)}
                className="rounded-lg px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-muted cursor-pointer"
              >
                Close
              </button>
            </div>

            <p className="mb-4 text-xs text-ink-muted leading-relaxed">
              Enter your Gmail address. If you are already approved, you&apos;ll sign in immediately.
              If you&apos;re new, your request will be sent to the <strong>Admin Approval</strong> queue.
            </p>

            {error && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2 rounded-lg border border-danger/35 bg-danger-soft p-3 text-xs text-danger"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleGmailRequestSubmit} autoComplete="off" className="space-y-3.5">
              <div>
                <Label htmlFor="gmail-name">Full Name</Label>
                <Input
                  id="gmail-name"
                  name="gmail_full_name"
                  type="text"
                  autoComplete="off"
                  required
                  placeholder="Your full name"
                  value={gmailName}
                  onChange={(e) => setGmailName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="gmail-email">Gmail Address</Label>
                <Input
                  id="gmail-email"
                  name="gmail_custom_address"
                  type="email"
                  autoComplete="off"
                  required
                  placeholder="yourname@gmail.com"
                  value={gmailEmail}
                  onChange={(e) => setGmailEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="gmail-password">Password (min 6 characters)</Label>
                <Input
                  id="gmail-password"
                  name="gmail_new_pass"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  placeholder="Enter or create password"
                  value={gmailPassword}
                  onChange={(e) => setGmailPassword(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowGmailModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={gmailSubmitting}>
                  {gmailSubmitting ? (
                    <>
                      <Spinner /> Continuing…
                    </>
                  ) : (
                    "Continue with Gmail"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Spinner className="h-5 w-5 text-accent" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
