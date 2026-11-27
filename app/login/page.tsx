"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  BookOpen,
  ClipboardCheck,
  Eye,
  EyeOff,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { getBrowserSupabase, isSupabaseConfigured } from "@/lib/client/supabase";
import { useAuth, roleHomePath } from "@/hooks/use-auth";
import {
  BrandMark,
  Button,
  Input,
  Label,
  Spinner,
  ThemeToggleButton,
} from "@/components/ui/primitives";

const PORTAL_FEATURES = [
  { icon: BookOpen, label: "Question banks, fair blueprint randomization & frozen paper snapshots" },
  { icon: ClipboardCheck, label: "Failure-resilient offline answer sync & server-authoritative timing" },
  { icon: ShieldCheck, label: "Cryptographic SHA-256 receipts, evidence timelines & public QR verification" },
  { icon: GraduationCap, label: "Role-based Candidate, Examiner & Administrator portals with live monitoring" },
];

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
    badge: string;
    heading: string;
    subtitle: string;
    placeholder: string;
    buttonLabel: string;
    allowRegister: boolean;
    allowGoogle: boolean;
  }
> = {
  admin: {
    badge: "Administrator Portal",
    heading: "Administrator Sign In",
    subtitle: "Sign in with your institutional administrator credentials",
    placeholder: "admin@exam.edu.pk",
    buttonLabel: "Sign In as Administrator",
    allowRegister: false,
    allowGoogle: false,
  },
  examiner: {
    badge: "Examiner Portal",
    heading: "Examiner Sign In",
    subtitle: "Sign in to create exams, manage question banks & monitor sessions",
    placeholder: "examiner@exam.edu.pk",
    buttonLabel: "Sign In as Examiner",
    allowRegister: false,
    allowGoogle: true,
  },
  student: {
    badge: "Student Portal",
    heading: "Student Sign In",
    subtitle: "Sign in to take exams, view signed receipts & check published results",
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
  const initialRole: LoginRoleTab =
    rawRoleParam === "admin" || rawRoleParam === "examiner" || rawRoleParam === "student"
      ? rawRoleParam
      : "student";
  const [selectedRole, setSelectedRole] = useState<LoginRoleTab>(initialRole);
  const { user, loading, refreshUser } = useAuth();

  useEffect(() => {
    if (rawRoleParam === "admin" || rawRoleParam === "examiner" || rawRoleParam === "student") {
      setSelectedRole(rawRoleParam);
    }
  }, [rawRoleParam]);

  const roleUi = ROLE_CONFIG[selectedRole];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
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
        setError(oauthError.message);
        setGoogleLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start Google sign-in");
      setGoogleLoading(false);
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
      {/* Top-right floating theme switch */}
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-5">
        <Link href="/" className="inline-flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-[2px] border border-border bg-surface p-1.5 surface-card">
            <BrandMark className="h-9 w-9" />
          </span>
          <div className="leading-tight">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
              NASTP INSTITUTE
            </p>
            <p className="font-display text-sm sm:text-base font-bold text-foreground">
              of Information Technology
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/verify"
            className="hidden sm:inline-flex h-9 items-center px-3 text-xs font-medium text-ink-muted hover:text-foreground transition-colors"
          >
            Public Verify
          </Link>
          <ThemeToggleButton showLabel />
        </div>
      </div>

      {/* NIIT AMS Split Canvas */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-10">
        <div className="grid w-full items-center gap-12 lg:grid-cols-12">
          {/* Left Institutional Showcase (Mirrors NIIT AMS Login Left Column) */}
          <div className="lg:col-span-7 space-y-7 animate-fade-rise">
            <h1 className="font-display text-4xl sm:text-5xl font-extrabold uppercase leading-[1.12] tracking-[0.02em] text-foreground">
              <span className="block">EXAMINATION</span>
              <span className="block text-accent">MANAGEMENT</span>
              <span className="block">PORTAL</span>
            </h1>

            <p className="max-w-lg text-sm sm:text-base text-ink-muted leading-relaxed">
              The exam system examiners can defend and students can trust — even when the internet fails. Offline-resilient answer sync, fair blueprint randomization, and cryptographically verifiable results.
            </p>

            <ul className="space-y-3 pt-1">
              {PORTAL_FEATURES.map((feat) => {
                const Icon = feat.icon;
                return (
                  <li key={feat.label} className="flex items-center gap-3.5 text-sm text-foreground">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] border border-border-strong bg-surface text-accent">
                      <Icon className="h-4 w-4" strokeWidth={1.7} />
                    </span>
                    <span className="text-ink-muted">{feat.label}</span>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center gap-2 pt-4 text-xs text-ink-subtle">
              <span className="h-2 w-2 rounded-full bg-portal-live" />
              <span>System operational · Lahore, Pakistan</span>
            </div>
          </div>

          {/* Right Elevated Sign-In Card (Mirrors NIIT AMS Auth Card) */}
          <div className="lg:col-span-5">
            <div className="rounded-[2px] border border-border bg-surface p-7 sm:p-9 surface-elevated">
              {/* Role Switcher Pills */}
              <div className="mb-5 grid grid-cols-3 gap-1.5 rounded-lg border border-border bg-surface-subtle p-1">
                {(["admin", "examiner", "student"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setSelectedRole(r);
                      router.replace(`/login?role=${r}`, { scroll: false });
                    }}
                    className={`rounded-md px-2 py-1.5 text-xs font-semibold capitalize transition cursor-pointer ${
                      selectedRole === r
                        ? "bg-accent text-accent-ink shadow-2xs"
                        : "text-ink-muted hover:text-foreground"
                    }`}
                  >
                    {r === "admin" ? "Admin" : r === "examiner" ? "Examiner" : "Student"}
                  </button>
                ))}
              </div>

              <div className="text-center space-y-2 mb-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-foreground">
                  <span className="h-2 w-2 rounded-full bg-portal-live" />
                  {roleUi.badge}
                </div>
                <h2 className="font-display text-2xl font-bold text-foreground pt-1">
                  {roleUi.heading}
                </h2>
                <p className="text-xs text-ink-subtle">
                  {roleUi.subtitle}
                </p>
              </div>

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
                        <span>Redirecting to Google…</span>
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

              <div className="mt-7 border-t border-border pt-5 text-center space-y-1.5 text-[11px] text-ink-subtle">
                <p>https://niit.edu.pk</p>
                <p>For system issues: admin@niit.edu.pk</p>
                <p className="inline-flex items-center gap-1.5 pt-1 font-medium text-ink-muted">
                  <BrandMark variant="square" className="h-4 w-4 border-none" />
                  <span>NIIT EMS · Verifiable Examination Portal</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
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
