"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client/api";
import type { PublicVerifyCodeResponse } from "@/lib/client/api-types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Spinner,
} from "@/components/ui/primitives";

export default function PublicVerifyCodePage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code ?? "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublicVerifyCodeResponse | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await api.verify.byCode(code);
        if (active) setData(res);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Certificate not found");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [code]);

  const currentUrl =
    typeof window !== "undefined" ? window.location.href : `/verify/${code}`;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/verify" className="inline-flex items-center gap-2 text-sm font-semibold text-accent">
            <ArrowLeft className="h-4 w-4" /> All Verification Tools
          </Link>
          <span className="font-mono text-xs text-ink-subtle">{code}</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-4 py-12">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Spinner /> Recomputing SHA-256 hash chain for {code}…
          </div>
        ) : error || !data ? (
          <Card className="w-full max-w-lg border-danger/40">
            <CardContent className="text-center space-y-4 py-8">
              <ShieldAlert className="mx-auto h-10 w-10 text-danger" />
              <h1 className="text-xl font-semibold">Verification Failed</h1>
              <p className="text-sm text-ink-muted">{error ?? "Invalid verification code"}</p>
              <Link href="/verify">
                <Button variant="secondary">Try Another Code</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card
            className={`w-full border-2 ${
              data.chainValid ? "border-verified" : "border-danger"
            }`}
          >
            <CardHeader
              className={data.chainValid ? "bg-verified-soft" : "bg-danger-soft"}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {data.chainValid ? (
                    <ShieldCheck className="h-9 w-9 text-verified shrink-0" />
                  ) : (
                    <ShieldAlert className="h-9 w-9 text-danger shrink-0" />
                  )}
                  <div>
                    <h1
                      className={`text-xl font-bold ${
                        data.chainValid ? "text-verified" : "text-danger"
                      }`}
                    >
                      {data.chainValid
                        ? "VERIFIED AUTHENTIC CERTIFICATE"
                        : "INTEGRITY ALERT — RECORD TAMPERED"}
                    </h1>
                    <p className="text-xs text-ink-muted">
                      Cryptographic chain audit across {data.recordCount} signed record(s)
                    </p>
                  </div>
                </div>
                <Badge tone={data.chainValid ? "verified" : "danger"}>
                  {data.verifyCode}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm flex-1">
                  <div>
                    <dt className="text-xs font-semibold uppercase text-ink-subtle">
                      Examination Title
                    </dt>
                    <dd className="mt-0.5 font-semibold text-base">{data.examTitle}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-ink-subtle">
                      Candidate (Privacy-Masked)
                    </dt>
                    <dd className="mt-0.5 font-mono font-semibold text-base">
                      {data.maskedName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-ink-subtle">
                      Verified Score Band
                    </dt>
                    <dd className="mt-0.5 font-semibold text-accent">{data.scoreBand}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-ink-subtle">
                      Issue Date
                    </dt>
                    <dd className="mt-0.5">{new Date(data.issuedAt).toLocaleString()}</dd>
                  </div>
                </dl>

                <div className="rounded-xl border border-border bg-white p-3 self-start">
                  <QRCodeSVG value={currentUrl} size={104} />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-ink-subtle">
                <span>
                  Privacy notice: Public certificates expose only exam title, masked name, score band, issue date, and hash-chain status.
                </span>
                {data.attemptId && (
                  <Link
                    href={`/verify?attemptId=${encodeURIComponent(data.attemptId)}`}
                    className="font-semibold text-accent hover:underline"
                  >
                    Inspect Full Hash Chains →
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
