"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  CheckCircle2,
  Link2,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/client/api";
import type {
  ChainVerificationResult,
  PublicVerifyAttemptResponse,
  PublicVerifyCodeResponse,
  PublicVerifyExamResponse,
} from "@/lib/client/api-types";
import {
  Badge,
  BrandMark,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  Label,
  Spinner,
  ThemeToggleButton,
} from "@/components/ui/primitives";
import { SiteFooter } from "@/components/site-footer";

type VerifyMode = "code" | "attempt" | "exam";

function ChainCard({
  title,
  chain,
}: {
  title: string;
  chain: ChainVerificationResult;
}) {
  return (
    <div
      className={`rounded-sm border p-4 ${
        chain.valid
          ? "border-verified/30 bg-verified-soft/50"
          : "border-danger/40 bg-danger-soft"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{title}</span>
        {chain.valid ? (
          <Badge tone="verified">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.6} /> Intact
          </Badge>
        ) : (
          <Badge tone="danger">
            <XCircle className="h-3.5 w-3.5" strokeWidth={1.6} /> Broken at #{chain.brokenAt}
          </Badge>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Records verified: <strong className="font-mono tabular-nums text-foreground">{chain.records}</strong>
      </p>
      <p
        className="mt-1 truncate font-mono text-xs text-ink-subtle tabular-nums"
        title={chain.headHash ?? ""}
      >
        Head: {chain.headHash ?? "Genesis (no records)"}
      </p>
    </div>
  );
}

function PublicVerifyInner() {
  const searchParams = useSearchParams();
  const initialAttemptId = searchParams.get("attemptId") ?? "";
  const initialExamId = searchParams.get("examId") ?? "";
  const initialCode = searchParams.get("code") ?? "";

  const [mode, setMode] = useState<VerifyMode>(
    initialAttemptId ? "attempt" : initialExamId ? "exam" : "code"
  );
  const [queryInput, setQueryInput] = useState(
    initialAttemptId || initialExamId || initialCode
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [codeResult, setCodeResult] = useState<PublicVerifyCodeResponse | null>(null);
  const [attemptResult, setAttemptResult] = useState<PublicVerifyAttemptResponse | null>(null);
  const [examResult, setExamResult] = useState<PublicVerifyExamResponse | null>(null);

  async function runVerify(targetMode: VerifyMode, rawValue: string) {
    const val = rawValue.trim();
    if (!val) return;
    setLoading(true);
    setError(null);
    setCodeResult(null);
    setAttemptResult(null);
    setExamResult(null);

    try {
      if (targetMode === "code") {
        const res = await api.verify.byCode(val);
        setCodeResult(res);
      } else if (targetMode === "attempt") {
        const res = await api.verify.attempt(val);
        setAttemptResult(res);
      } else {
        const res = await api.verify.exam(val);
        setExamResult(res);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification lookup failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (initialAttemptId) {
        void runVerify("attempt", initialAttemptId);
      } else if (initialExamId) {
        void runVerify("exam", initialExamId);
      } else if (initialCode) {
        void runVerify("code", initialCode);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [initialAttemptId, initialExamId, initialCode]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    runVerify(mode, queryInput);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2.5 text-foreground">
            <BrandMark className="h-8 w-8" />
            <div className="leading-tight">
              <span className="block font-display text-sm font-bold uppercase tracking-[0.06em]">
                NIIT EMS
              </span>
              <span className="hidden sm:block text-[10px] uppercase tracking-[0.08em] text-ink-subtle">
                Public Certificate Verifier
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-2.5">
            <ThemeToggleButton />
            <Link href="/" className="text-xs font-medium uppercase tracking-[0.05em] text-ink-muted hover:text-foreground transition-colors">
              Home
            </Link>
            <Link href="/login">
              <Button size="sm" variant="primary">
                Sign in
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6 space-y-6">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-verified">
            <Link2 className="h-3.5 w-3.5" strokeWidth={1.6} />
            Public cryptographic audit
          </div>
          <h1 className="text-3xl sm:text-4xl font-medium tracking-[-0.02em]">
            Verify any certificate or hash chain
          </h1>
          <p className="text-sm sm:text-base text-ink-muted max-w-2xl">
            Check a result certificate code, audit an attempt&apos;s SHA-256 answer and event chains, or verify an exam&apos;s seed commitment and checkpoint signature. No private candidate data is exposed.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4">
            <div className="inline-flex flex-wrap gap-1.5 rounded-xl border border-border bg-surface-subtle p-1">
              {(
                [
                  { id: "code", label: "Certificate code" },
                  { id: "attempt", label: "Attempt hash chain" },
                  { id: "exam", label: "Exam seed & checkpoint" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMode(m.id);
                    setError(null);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-[background-color,color] duration-150 cursor-pointer ${
                    mode === m.id
                      ? "bg-surface text-foreground border border-border surface-card"
                      : "text-ink-muted hover:text-foreground border border-transparent"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 sm:flex-row">
              <div className="flex-1">
                <Label htmlFor="verify-input" className="sr-only">
                  Verification identifier
                </Label>
                <Input
                  id="verify-input"
                  placeholder={
                    mode === "code"
                      ? "VER-A1B2C3D4E5"
                      : mode === "attempt"
                      ? "Attempt UUID"
                      : "Exam UUID"
                  }
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  className="font-mono"
                />
              </div>
              <Button type="submit" disabled={loading || !queryInput.trim()}>
                {loading ? (
                  <Spinner />
                ) : (
                  <>
                    <Search className="h-4 w-4" strokeWidth={1.6} /> Verify
                  </>
                )}
              </Button>
            </form>

            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        {codeResult && (
          <Card
            className={
              codeResult.chainValid ? "border-verified/40" : "border-danger/60"
            }
          >
            <CardHeader
              className={
                codeResult.chainValid ? "bg-verified-soft/60" : "bg-danger-soft"
              }
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {codeResult.chainValid ? (
                    <ShieldCheck className="h-6 w-6 text-verified" strokeWidth={1.6} />
                  ) : (
                    <ShieldAlert className="h-6 w-6 text-danger" strokeWidth={1.6} />
                  )}
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {codeResult.chainValid
                        ? "Verified — hash chain intact"
                        : "Tampering detected — chain broken"}
                    </h2>
                    <p className="text-xs text-ink-muted tabular-nums">
                      {codeResult.recordCount} cryptographic record(s) verified
                    </p>
                  </div>
                </div>
                <Badge tone={codeResult.chainValid ? "verified" : "danger"}>
                  {codeResult.verifyCode}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <dl className="grid grid-cols-2 gap-4 text-sm flex-1">
                <div>
                  <dt className="text-xs font-medium text-ink-subtle">Examination</dt>
                  <dd className="mt-0.5 font-medium text-foreground">{codeResult.examTitle}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-ink-subtle">Candidate (masked)</dt>
                  <dd className="mt-0.5 font-mono font-medium text-foreground">{codeResult.maskedName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-ink-subtle">Score band</dt>
                  <dd className="mt-0.5 font-medium text-accent">{codeResult.scoreBand}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-ink-subtle">Issued at</dt>
                  <dd className="mt-0.5 text-foreground tabular-nums">
                    {new Date(codeResult.issuedAt).toLocaleString()}
                  </dd>
                </div>
              </dl>

              <div className="rounded-xl border border-border bg-white p-2.5 self-start shrink-0">
                <QRCodeSVG value={codeResult.verifyCode} size={88} />
              </div>
            </CardContent>
          </Card>
        )}

        {attemptResult && (
          <Card
            className={
              attemptResult.valid ? "border-verified/40" : "border-danger/60"
            }
          >
            <CardHeader
              className={
                attemptResult.valid
                  ? "bg-verified-soft/60"
                  : "bg-danger-soft"
              }
            >
              <div className="flex items-center gap-3">
                {attemptResult.valid ? (
                  <CheckCircle2 className="h-6 w-6 text-verified shrink-0" strokeWidth={1.6} />
                ) : (
                  <XCircle className="h-6 w-6 text-danger shrink-0" strokeWidth={1.6} />
                )}
                <div>
                  <h2
                    className={`text-lg font-medium ${
                      attemptResult.valid ? "text-verified" : "text-danger"
                    }`}
                  >
                    {attemptResult.valid
                      ? "All attempt hash chains verified"
                      : "Tampering detected in database records"}
                  </h2>
                  <p className="text-xs text-ink-muted font-mono tabular-nums">
                    Attempt ID: {attemptResult.attemptId}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <ChainCard title="Answers ledger" chain={attemptResult.answersChain} />
              <ChainCard title="Events timeline" chain={attemptResult.eventsChain} />
              <ChainCard title="Lock events chain" chain={attemptResult.lockEventsChain} />
            </CardContent>
          </Card>
        )}

        {examResult && (
          <Card
            className={
              examResult.allChainsValid ? "border-verified/40" : "border-danger/60"
            }
          >
            <CardHeader
              className={
                examResult.allChainsValid
                  ? "bg-verified-soft/60"
                  : "bg-danger-soft"
              }
            >
              <div className="flex items-center gap-3">
                {examResult.allChainsValid ? (
                  <ShieldCheck className="h-6 w-6 text-verified" strokeWidth={1.6} />
                ) : (
                  <ShieldAlert className="h-6 w-6 text-danger" strokeWidth={1.6} />
                )}
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    {examResult.examTitle} —{" "}
                    {examResult.allChainsValid
                      ? "All chains intact"
                      : "Chain integrity failure detected"}
                  </h2>
                  <p className="text-xs text-ink-muted tabular-nums">
                    {examResult.attemptsChecked} attempt(s) audited · Checkpoint signature{" "}
                    {examResult.checkpointValid ? "valid" : "pending"}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div>
                <p className="font-medium text-ink-subtle">Seed commitment (SHA-256)</p>
                <p className="mt-1 break-all rounded-lg border border-border bg-surface-subtle p-2.5 font-mono">
                  {examResult.seedCommitment ?? "—"}
                </p>
              </div>
              <div>
                <p className="font-medium text-ink-subtle">Seed reveal</p>
                <p className="mt-1 break-all rounded-lg border border-border bg-surface-subtle p-2.5 font-mono">
                  {examResult.seedReveal ?? "Sealed until examiner reveals after completion"}
                </p>
              </div>
              <div>
                <p className="font-medium text-ink-subtle">Exam checkpoint hash</p>
                <p className="mt-1 break-all rounded-lg border border-border bg-surface-subtle p-2.5 font-mono">
                  {examResult.checkpointHash ?? "—"}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

export default function PublicVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Spinner className="h-5 w-5 text-accent" />
        </div>
      }
    >
      <PublicVerifyInner />
    </Suspense>
  );
}
