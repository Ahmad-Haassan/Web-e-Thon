"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  KeyRound,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  Label,
  Spinner,
} from "@/components/ui/primitives";
import { useAuth } from "@/hooks/use-auth";
import { getBrowserSupabase } from "@/lib/client/supabase";

interface TotpFactor {
  id: string;
  friendly_name?: string;
  status: string;
  created_at?: string;
}

interface PendingEnrollment {
  factorId: string;
  uri: string;
  secret: string;
}

export default function SecurityPage() {
  const { user } = useAuth();
  const [loadingFactors, setLoadingFactors] = useState(true);
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [aal, setAal] = useState<{ currentLevel: string | null; nextLevel: string | null }>({
    currentLevel: null,
    nextLevel: null,
  });
  const [enrolling, setEnrolling] = useState(false);
  const [pending, setPending] = useState<PendingEnrollment | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMfaState = useCallback(async () => {
    setLoadingFactors(true);
    setError(null);
    try {
      const supabase = getBrowserSupabase();
      const [{ data: factorData, error: fErr }, { data: aalData }] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);

      if (fErr) {
        setError(fErr.message);
      } else {
        setFactors((factorData?.totp ?? []) as TotpFactor[]);
      }

      if (aalData) {
        setAal({
          currentLevel: aalData.currentLevel ?? null,
          nextLevel: aalData.nextLevel ?? null,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load MFA status");
    } finally {
      setLoadingFactors(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadMfaState();
    }
  }, [user, loadMfaState]);

  async function startEnrollment() {
    setEnrolling(true);
    setError(null);
    try {
      const supabase = getBrowserSupabase();

      // Clean up any stale unverified factor so re-enrollment never collides
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }

      const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Google Authenticator",
        issuer: "VeriExam",
      });

      if (enrollErr || !data) {
        setError(enrollErr?.message ?? "Failed to start Google Authenticator setup");
        return;
      }

      setPending({
        factorId: data.id,
        uri: data.totp.uri,
        secret: data.totp.secret,
      });
      setVerifyCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrollment failed");
    } finally {
      setEnrolling(false);
    }
  }

  async function confirmEnrollment(e: FormEvent) {
    e.preventDefault();
    if (!pending) return;

    const cleanCode = verifyCode.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(cleanCode)) {
      setError("Enter the 6-digit code shown in Google Authenticator.");
      return;
    }

    setVerifying(true);
    setError(null);
    try {
      const supabase = getBrowserSupabase();
      const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
        factorId: pending.factorId,
        code: cleanCode,
      });

      if (verifyErr) {
        setError(verifyErr.message);
        return;
      }

      toast.success("Google Authenticator (2FA) enabled!");
      setPending(null);
      setVerifyCode("");
      await loadMfaState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function cancelEnrollment() {
    if (pending) {
      try {
        const supabase = getBrowserSupabase();
        await supabase.auth.mfa.unenroll({ factorId: pending.factorId });
      } catch {
        // ignore cleanup error
      }
    }
    setPending(null);
    setVerifyCode("");
    setError(null);
  }

  async function removeFactor(factorId: string) {
    setRemovingId(factorId);
    setError(null);
    try {
      const supabase = getBrowserSupabase();
      const { error: unenrollErr } = await supabase.auth.mfa.unenroll({ factorId });
      if (unenrollErr) {
        setError(unenrollErr.message);
        return;
      }
      toast.success("Google Authenticator removed from your account.");
      await loadMfaState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove authenticator");
    } finally {
      setRemovingId(null);
    }
  }

  const verifiedFactors = factors.filter((f) => f.status === "verified");
  const isProtected = verifiedFactors.length > 0;

  return (
    <AppShell
      title="Account Security & 2FA"
      subtitle="Protect your account with Google Authenticator (TOTP)"
    >
      <div className="mx-auto max-w-2xl space-y-6">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft p-3.5 text-sm text-danger"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Current Status */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Smartphone className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Google Authenticator (TOTP)
                  </h2>
                  <p className="text-xs text-ink-muted">
                    Works with Google Authenticator, Microsoft Authenticator, Authy, or 1Password
                  </p>
                </div>
              </div>
              {loadingFactors ? (
                <Spinner />
              ) : isProtected ? (
                <Badge tone="verified">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Enabled ({aal.currentLevel?.toUpperCase() ?? "AAL2"})
                </Badge>
              ) : (
                <Badge tone="warning">Not Enabled</Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {user && (user.role === "ADMIN" || user.role === "EXAMINER") && !isProtected && (
              <div className="rounded-lg border border-accent/25 bg-accent-soft p-3 text-xs text-accent">
                <strong>Recommended for {user.role}s:</strong> Enable Google Authenticator so every
                examiner/admin sign-in requires a rotating 6-digit verification code.
              </div>
            )}

            {loadingFactors ? (
              <div className="flex items-center gap-2 py-4 text-sm text-ink-muted">
                <Spinner /> Checking authenticator status…
              </div>
            ) : pending ? (
              <div className="space-y-4 rounded-xl border border-border bg-surface-subtle p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    Step 1 — Scan QR Code in Google Authenticator
                  </h3>
                  <Button type="button" variant="ghost" size="sm" onClick={cancelEnrollment}>
                    Cancel
                  </Button>
                </div>

                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                  <div className="rounded-xl border border-border bg-white p-3 shadow-xs">
                    <QRCodeSVG value={pending.uri} size={172} level="M" />
                  </div>
                  <div className="flex-1 space-y-3 text-xs text-ink-muted">
                    <p>
                      Open <strong>Google Authenticator</strong> on your phone, tap{" "}
                      <strong>+</strong> → <strong>Scan a QR code</strong>, and point your camera
                      at the code.
                    </p>
                    <div>
                      <p className="mb-1 font-semibold text-foreground">
                        Or enter this setup key manually:
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 break-all rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px] text-foreground">
                          {pending.secret}
                        </code>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            void navigator.clipboard.writeText(pending.secret);
                            toast.success("Setup key copied");
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <form onSubmit={confirmEnrollment} className="space-y-3 border-t border-border pt-4">
                  <Label htmlFor="totp-verify">
                    Step 2 — Enter the 6-digit code from Google Authenticator
                  </Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="totp-verify"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="123456"
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="font-mono text-base tracking-[0.35em] sm:max-w-[200px]"
                      required
                    />
                    <Button type="submit" variant="verified" disabled={verifying}>
                      {verifying ? (
                        <>
                          <Spinner /> Verifying…
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-4 w-4" /> Verify &amp; Activate
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            ) : verifiedFactors.length > 0 ? (
              <div className="space-y-3">
                {verifiedFactors.map((factor) => (
                  <div
                    key={factor.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-verified/30 bg-verified-soft/40 p-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <KeyRound className="h-4 w-4 text-verified" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {factor.friendly_name || "Google Authenticator"}
                        </p>
                        <p className="text-xs text-ink-muted">
                          Active TOTP factor · Required on every sign-in
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={removingId === factor.id}
                      onClick={() => void removeFactor(factor.id)}
                    >
                      {removingId === factor.id ? (
                        <Spinner />
                      ) : (
                        <>
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-border bg-surface-subtle p-4 sm:flex-row sm:items-center">
                <div className="text-sm text-ink-muted">
                  Add a 6-digit rotating code from Google Authenticator as a second sign-in factor.
                </div>
                <Button type="button" onClick={startEnrollment} disabled={enrolling}>
                  {enrolling ? (
                    <>
                      <Spinner /> Preparing QR…
                    </>
                  ) : (
                    <>
                      <Smartphone className="h-4 w-4" /> Set Up Google Authenticator
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
