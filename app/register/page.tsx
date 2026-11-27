"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { getBrowserSupabase, isSupabaseConfigured, markTabSessionActive } from "@/lib/client/supabase";
import { useAuth, roleHomePath } from "@/hooks/use-auth";
import {
  BrandMark,
  Button,
  Input,
  Label,
  Select,
  Spinner,
  ThemeToggleButton,
} from "@/components/ui/primitives";

const DEFAULT_CLASSES = ["IX", "X", "XI", "XII", "BSCS-1", "BSCS-2", "BSCS-3", "BSCS-4", "BSSE-4"];
const DEFAULT_SECTIONS = ["A", "B", "C", "D"];

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

export default function RegisterPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [className, setClassName] = useState("BSCS-4");
  const [section, setSection] = useState("A");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);

  async function handleGoogleSignUp() {
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

    if (name.trim().length < 2) {
      setError("Enter your full name (at least 2 characters).");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (!isSupabaseConfigured()) {
      setError(
        "Supabase environment variables are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local."
      );
      return;
    }

    setSubmitting(true);
    try {
      const reqRes = await fetch("/api/auth/gmail-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim(),
          password,
          requestedRole: "CANDIDATE",
        }),
      });
      const reqData = await reqRes.json();
      if (!reqRes.ok) {
        setError(reqData.error ?? "Registration failed");
        setSubmitting(false);
        return;
      }

      const supabase = getBrowserSupabase();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setSubmitting(false);
        return;
      }

      markTabSessionActive();
      const appUser = await refreshUser();
      if (!appUser || !appUser.active || reqData.pendingApproval) {
        toast.info("Account created! Please wait until an Administrator approves your account.");
        router.replace("/pending-approval");
        return;
      }
      toast.success("Candidate account created");
      router.replace(roleHomePath(appUser.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-5">
        <Link href="/" className="inline-flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-[2px] border border-border bg-surface p-1.5 surface-card">
            <BrandMark className="h-9 w-9" />
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="inline-flex h-9 items-center px-3 text-xs font-medium text-ink-muted hover:text-foreground transition-colors"
          >
            Sign In
          </Link>
          <ThemeToggleButton showLabel />
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-10">
        <div className="grid w-full items-center gap-12 lg:grid-cols-12">
          {/* Left Institutional Showcase */}
          <div className="lg:col-span-6 space-y-6 animate-fade-rise">
            <h1 className="font-display text-4xl sm:text-5xl font-extrabold uppercase leading-[1.12] tracking-[0.02em] text-foreground">
              <span className="block">STUDENT</span>
              <span className="block text-accent">ENROLLMENT</span>
              <span className="block">PORTAL</span>
            </h1>

            <p className="max-w-lg text-sm sm:text-base text-ink-muted leading-relaxed">
              Register your candidate profile with your academic class and section so your datesheet, admit card, and scheduled exams appear automatically.
            </p>

            <ul className="space-y-3 pt-1">
              <li className="flex items-center gap-3.5 text-sm text-ink-muted">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] border border-border-strong bg-surface text-accent">
                  <GraduationCap className="h-4 w-4" strokeWidth={1.7} />
                </span>
                <span>Self-signup creates a Candidate account; staff roles are provisioned by Admin</span>
              </li>
              <li className="flex items-center gap-3.5 text-sm text-ink-muted">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] border border-border-strong bg-surface text-accent">
                  <ShieldCheck className="h-4 w-4" strokeWidth={1.7} />
                </span>
                <span>Every submitted answer is backed by a server-signed cryptographic receipt</span>
              </li>
            </ul>
          </div>

          {/* Right Registration Card */}
          <div className="lg:col-span-6">
            <div className="rounded-[2px] border border-border bg-surface p-7 sm:p-9 surface-elevated">
              {needsEmailConfirm ? (
                <div className="space-y-4 text-center py-6">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-verified" />
                  <h2 className="font-display text-xl font-bold uppercase">Check Your Email</h2>
                  <p className="text-sm text-ink-muted">
                    We sent a confirmation link to <strong>{email}</strong>. Once confirmed, sign in to view your enrolled exams.
                  </p>
                  <Link href="/login">
                    <Button>Back to Sign In</Button>
                  </Link>
                </div>
              ) : (
                <>
                  <div className="text-center space-y-1.5 mb-6">
                    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-foreground">
                      <span className="h-2 w-2 rounded-full bg-portal-live" />
                      Candidate Registration
                    </div>
                    <h2 className="font-display text-2xl font-bold text-foreground pt-1">
                      Create Student Account
                    </h2>
                    <p className="text-xs text-ink-subtle">
                      Link your university email, class, and section
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
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="name">FULL NAME</Label>
                        <Input
                          id="name"
                          type="text"
                          required
                          minLength={2}
                          placeholder="Noman Arshad"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone">PHONE NUMBER (OPTIONAL)</Label>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="+92 300 1234567"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="email">UNIVERSITY EMAIL</Label>
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="className">CLASS / COHORT</Label>
                        <Input
                          id="className"
                          list="reg-classes-list"
                          placeholder="e.g. BSCS-4"
                          value={className}
                          onChange={(e) => setClassName(e.target.value)}
                        />
                        <datalist id="reg-classes-list">
                          {DEFAULT_CLASSES.map((c) => (
                            <option key={c} value={c} />
                          ))}
                        </datalist>
                      </div>

                      <div>
                        <Label htmlFor="section">SECTION</Label>
                        <Select
                          id="section"
                          value={section}
                          onChange={(e) => setSection(e.target.value)}
                          className="h-11"
                        >
                          {DEFAULT_SECTIONS.map((s) => (
                            <option key={s} value={s}>
                              Section {s}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="password">PASSWORD (MIN 8 CHARACTERS)</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          minLength={8}
                          placeholder="Create a strong password"
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
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <Button type="submit" className="w-full h-11 shadow-md" disabled={submitting || googleLoading}>
                      {submitting ? (
                        <>
                          <Spinner /> Creating Account…
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4" /> Register as Candidate
                        </>
                      )}
                    </Button>
                  </form>

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                      <span className="bg-surface px-3 text-ink-subtle">Or continue with Gmail</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleSignUp}
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

                  <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-ink-muted">
                    <span>Already have a portal account?</span>
                    <Link href="/login" className="font-semibold text-accent hover:underline">
                      Sign In
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
