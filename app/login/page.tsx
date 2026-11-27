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
  { icon: BookOpen, label: "Courses, classes, question banks & blueprints" },
  { icon: ClipboardCheck, label: "Examinations, datesheets, admit cards & results" },
  { icon: ShieldCheck, label: "Offline-resilient saves & SHA-256 receipts" },
  { icon: GraduationCap, label: "Student, Examiner & Administrator portals" },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const { user, loading, refreshUser } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace(nextPath && nextPath.startsWith("/") ? nextPath : roleHomePath(user.role));
    }
  }, [user, loading, router, nextPath]);

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
              Student lifecycle, courses, offline-resilient exams, datesheets, and verifiable results — every assessment workflow in one institutional portal.
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
              <div className="text-center space-y-2 mb-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-foreground">
                  <span className="h-2 w-2 rounded-full bg-portal-live" />
                  Examination Management System
                </div>
                <h2 className="font-display text-2xl font-bold text-foreground pt-1">
                  Welcome Back
                </h2>
                <p className="text-xs text-ink-subtle">
                  Sign in to NIIT Examination Management Portal
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
                    placeholder="f2025cs006@niit.edu.pk"
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
                  <Link href="/register" className="font-medium text-accent hover:underline">
                    New student? Register
                  </Link>
                  <Link href="/verify" className="text-ink-muted hover:text-foreground hover:underline">
                    Verify Certificate
                  </Link>
                </div>

                <Button type="submit" className="w-full h-11 shadow-md" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Spinner /> Signing In…
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>

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
