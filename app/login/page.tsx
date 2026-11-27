"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { getBrowserSupabase, isSupabaseConfigured } from "@/lib/client/supabase";
import { useAuth, roleHomePath } from "@/hooks/use-auth";
import { Button, Card, CardContent, Input, Label, Spinner } from "@/components/ui/primitives";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const { user, loading, refreshUser } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google Authenticator (TOTP) 2FA challenge state
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [verifyingMfa, setVerifyingMfa] = useState(false);

  // If user was redirected here with an AAL1 session that still needs AAL2 (Google Authenticator), show 2FA prompt immediately
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let active = true;
    (async () => {
      const supabase = getBrowserSupabase();
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!active) return;
      if (aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2") {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const verifiedTotp = factors?.totp?.find((f) => f.status === "verified");
        if (active && verifiedTotp) {
          setMfaFactorId(verifiedTotp.id);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loading && user && !mfaFactorId) {
      router.replace(nextPath && nextPath.startsWith("/") ? nextPath : roleHomePath(user.role));
    }
  }, [user, loading, mfaFactorId, router, nextPath]);

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

      // Check whether this account requires Google Authenticator (AAL2)
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2") {
        const { data: factors, error: factorErr } = await supabase.auth.mfa.listFactors();
        if (factorErr) {
          setError(factorErr.message);
          setSubmitting(false);
          return;
        }
        const totp = factors?.totp?.find((f) => f.status === "verified");
        if (totp) {
          setMfaFactorId(totp.id);
          setMfaCode("");
          setSubmitting(false);
          return;
        }
      }

      const appUser = await refreshUser();
      if (!appUser) {
        setError("Signed in, but could not load your profile from /api/me. Ensure backend & DB are running.");
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

  async function handleMfaVerify(e: FormEvent) {
    e.preventDefault();
    if (!mfaFactorId) return;
    setError(null);

    const cleanCode = mfaCode.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(cleanCode)) {
      setError("Enter the 6-digit code from Google Authenticator.");
      return;
    }

    setVerifyingMfa(true);
    try {
      const supabase = getBrowserSupabase();
      const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
        factorId: mfaFactorId,
        code: cleanCode,
      });

      if (verifyErr) {
        setError(verifyErr.message);
        setVerifyingMfa(false);
        return;
      }

      setMfaFactorId(null);
      const appUser = await refreshUser();
      if (!appUser) {
        setError("2FA verified, but could not load your profile from /api/me.");
        setVerifyingMfa(false);
        return;
      }

      toast.success(`2FA verified — welcome back, ${appUser.name}`);
      router.replace(nextPath && nextPath.startsWith("/") ? nextPath : roleHomePath(appUser.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify authenticator code");
      setVerifyingMfa(false);
    }
  }

  async function handleCancelMfa() {
    if (isSupabaseConfigured()) {
      const supabase = getBrowserSupabase();
      await supabase.auth.signOut();
    }
    setMfaFactorId(null);
    setMfaCode("");
    setError(null);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Link href="/" className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-xs">
            {mfaFactorId ? <Smartphone className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {mfaFactorId ? "Google Authenticator Verification" : "Sign in to VeriExam"}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {mfaFactorId
              ? "Enter the 6-digit code from your Google Authenticator app"
              : "Admin, Examiner, and Candidate access with server-verified roles"}
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            {error && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {mfaFactorId ? (
              <form onSubmit={handleMfaVerify} className="space-y-4">
                <div>
                  <Label htmlFor="mfa-code">6-Digit Authenticator Code</Label>
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    required
                    placeholder="123456"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="text-center font-mono text-lg tracking-[0.4em]"
                  />
                </div>

                <Button type="submit" variant="verified" className="w-full" size="lg" disabled={verifyingMfa}>
                  {verifyingMfa ? (
                    <>
                      <Spinner /> Verifying…
                    </>
                  ) : (
                    <>
                      Verify &amp; Continue <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  size="sm"
                  onClick={() => void handleCancelMfa()}
                >
                  Use a different account
                </Button>
              </form>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="email">University Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="student@university.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>

                  <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Spinner /> Signing in…
                      </>
                    ) : (
                      <>
                        Sign In <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>

                <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-ink-muted">
                  <span>New candidate?</span>
                  <Link href="/register" className="font-semibold text-accent hover:underline">
                    Create student account
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="mt-4 text-center text-xs text-ink-subtle">
          Looking to verify a result certificate?{" "}
          <Link href="/verify" className="font-medium text-accent hover:underline">
            Public Verification Portal
          </Link>
        </div>
      </div>
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
