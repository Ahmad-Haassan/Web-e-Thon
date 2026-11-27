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
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  Label,
  Spinner,
} from "@/components/ui/primitives";

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
      className={`rounded-xl border p-4 ${
        chain.valid
          ? "border-verified/40 bg-verified-soft/60"
          : "border-danger bg-danger-soft"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {chain.valid ? (
          <Badge tone="verified">
            <CheckCircle2 className="h-3.5 w-3.5" /> INTACT
          </Badge>
        ) : (
          <Badge tone="danger">
            <XCircle className="h-3.5 w-3.5" /> BROKEN AT #{chain.brokenAt}
          </Badge>
        )}
      </div>
      <p className="mt-1.5 text-xs text-ink-muted">
        Records verified: <strong className="font-mono">{chain.records}</strong>
      </p>
      <p
        className="mt-1 truncate font-mono text-[11px] text-ink-subtle"
        title={chain.headHash ?? ""}
      >
        Head: {chain.headHash ?? "GENESIS (no records)"}
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
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink">
              <ShieldCheck className="h-4.5 w-4.5" />
            </span>
            <span>VeriExam Public Audit</span>
          </Link>
          <Link href="/login">
            <Button size="sm" variant="secondary">
              Sign In
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 space-y-6">
        <div className="space-y-2">
          <Badge tone="verified">
            <Link2 className="h-3.5 w-3.5" /> Public Cryptographic Verifier
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            Don&apos;t trust us — verify the hash chain.
          </h1>
          <p className="text-sm text-ink-muted max-w-2xl">
            Verify any result certificate code, inspect an attempt&apos;s SHA-256 answer/event hash chains, or audit an exam&apos;s seed commitment &amp; checkpoint signature. No private candidate data is ever leaked.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "code", label: "Certificate Code (VER-...)" },
                  { id: "attempt", label: "Attempt Hash Chain (UUID)" },
                  { id: "exam", label: "Exam Seed & Checkpoint (UUID)" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMode(m.id);
                    setError(null);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    mode === m.id
                      ? "bg-accent text-accent-ink"
                      : "border border-border bg-surface-subtle text-ink-muted hover:text-foreground"
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
                      ? "Enter certificate code, e.g. VER-A1B2C3D4E5"
                      : mode === "attempt"
                      ? "Paste Attempt UUID to audit its SHA-256 hash chains"
                      : "Paste Exam UUID to audit seed commitment & checkpoint"
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
                    <Search className="h-4 w-4" /> Verify Now
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

        {/* Certificate Code Result */}
        {codeResult && (
          <Card
            className={
              codeResult.chainValid ? "border-2 border-verified" : "border-2 border-danger"
            }
          >
            <CardHeader
              className={
                codeResult.chainValid ? "bg-verified-soft/70" : "bg-danger-soft"
              }
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {codeResult.chainValid ? (
                    <ShieldCheck className="h-7 w-7 text-verified" />
                  ) : (
                    <ShieldAlert className="h-7 w-7 text-danger" />
                  )}
                  <div>
                    <h2 className="text-lg font-bold">
                      {codeResult.chainValid
                        ? "VERIFIED — Hash Chain Intact"
                        : "TAMPERING DETECTED — Chain Broken"}
                    </h2>
                    <p className="text-xs text-ink-muted">
                      {codeResult.recordCount} cryptographic record(s) checked
                    </p>
                  </div>
                </div>
                <Badge tone={codeResult.chainValid ? "verified" : "danger"}>
                  {codeResult.verifyCode}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <dl className="grid grid-cols-2 gap-4 text-sm flex-1">
                <div>
                  <dt className="text-xs uppercase font-semibold text-ink-subtle">Examination</dt>
                  <dd className="font-semibold">{codeResult.examTitle}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase font-semibold text-ink-subtle">
                    Candidate (Masked)
                  </dt>
                  <dd className="font-mono font-semibold">{codeResult.maskedName}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase font-semibold text-ink-subtle">Score Band</dt>
                  <dd className="font-semibold text-accent">{codeResult.scoreBand}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase font-semibold text-ink-subtle">Issued At</dt>
                  <dd>{new Date(codeResult.issuedAt).toLocaleString()}</dd>
                </div>
              </dl>

              <div className="rounded-lg border border-border bg-white p-2.5 self-start">
                <QRCodeSVG value={codeResult.verifyCode} size={88} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Attempt Hash Chain Result (THE TAMPER DEMO MOMENT!) */}
        {attemptResult && (
          <Card
            className={
              attemptResult.valid ? "border-2 border-verified" : "border-2 border-danger"
            }
          >
            <CardHeader
              className={attemptResult.valid ? "bg-verified-soft" : "bg-danger-soft"}
            >
              <div className="flex items-center gap-3">
                {attemptResult.valid ? (
                  <CheckCircle2 className="h-8 w-8 text-verified shrink-0" />
                ) : (
                  <XCircle className="h-8 w-8 text-danger shrink-0" />
                )}
                <div>
                  <h2
                    className={`text-xl font-bold ${
                      attemptResult.valid ? "text-verified" : "text-danger"
                    }`}
                  >
                    {attemptResult.valid
                      ? "GREEN — All Attempt Hash Chains Verified"
                      : "RED — Tampering Detected in Database Records"}
                  </h2>
                  <p className="text-xs text-ink-muted font-mono">
                    Attempt ID: {attemptResult.attemptId}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <ChainCard title="Answers Ledger" chain={attemptResult.answersChain} />
              <ChainCard title="Events Timeline" chain={attemptResult.eventsChain} />
              <ChainCard title="Lock Events Chain" chain={attemptResult.lockEventsChain} />
            </CardContent>
          </Card>
        )}

        {/* Exam Seed & Checkpoint Result */}
        {examResult && (
          <Card
            className={
              examResult.allChainsValid ? "border-2 border-verified" : "border-2 border-danger"
            }
          >
            <CardHeader
              className={examResult.allChainsValid ? "bg-verified-soft" : "bg-danger-soft"}
            >
              <div className="flex items-center gap-3">
                {examResult.allChainsValid ? (
                  <ShieldCheck className="h-7 w-7 text-verified" />
                ) : (
                  <ShieldAlert className="h-7 w-7 text-danger" />
                )}
                <div>
                  <h2 className="text-lg font-bold">
                    {examResult.examTitle} —{" "}
                    {examResult.allChainsValid
                      ? "All Chains Intact"
                      : "Chain Integrity Failure Detected"}
                  </h2>
                  <p className="text-xs text-ink-muted">
                    {examResult.attemptsChecked} attempt(s) audited · Checkpoint signature{" "}
                    {examResult.checkpointValid ? "valid" : "pending/unverified"}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div>
                <p className="font-semibold uppercase text-ink-subtle">Seed Commitment (SHA-256)</p>
                <p className="mt-1 break-all rounded-md border border-border bg-surface-subtle p-2 font-mono">
                  {examResult.seedCommitment ?? "—"}
                </p>
              </div>
              <div>
                <p className="font-semibold uppercase text-ink-subtle">Seed Reveal</p>
                <p className="mt-1 break-all rounded-md border border-border bg-surface-subtle p-2 font-mono">
                  {examResult.seedReveal ?? "Sealed until examiner reveals post-exam"}
                </p>
              </div>
              <div>
                <p className="font-semibold uppercase text-ink-subtle">Exam Checkpoint Hash</p>
                <p className="mt-1 break-all rounded-md border border-border bg-surface-subtle p-2 font-mono">
                  {examResult.checkpointHash ?? "—"}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
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
