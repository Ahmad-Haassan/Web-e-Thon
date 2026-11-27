"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileDown,
  FileWarning,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Label,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui/primitives";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/client/api";
import {
  attemptMaxScore,
  attemptVerifyCode,
  type DisputeType,
} from "@/lib/client/api-types";

export default function AttemptResultPage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = params.attemptId;
  const { user } = useAuth();

  const [disputeTargetQId, setDisputeTargetQId] = useState<string | null | undefined>(undefined);
  const [disputeType, setDisputeType] = useState<DisputeType>("GRADING");
  const [disputeReason, setDisputeReason] = useState("");

  const resultQuery = useQuery({
    queryKey: ["attempt-result", attemptId],
    queryFn: () => api.attempts.result(attemptId),
    enabled: Boolean(attemptId),
  });

  const disputeMut = useMutation({
    mutationFn: api.disputes.create,
    onSuccess: () => {
      toast.success("Dispute submitted with automatic evidence timeline attachment");
      setDisputeTargetQId(undefined);
      setDisputeReason("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const data = resultQuery.data;
  const attempt = data?.attempt;
  const verifyCode = data?.verifyCode ?? (attempt ? attemptVerifyCode(attempt) : "");
  const maxScore = attempt ? attemptMaxScore(attempt) : 0;
  const questions = data?.questionsWithExplanations ?? data?.questions ?? data?.breakdown ?? [];
  const receipts = data?.receipts ?? [];
  const summary = data?.summary;
  const scorePct =
    summary?.percentage ??
    (attempt?.score !== null && attempt?.score !== undefined && maxScore > 0
      ? Math.round((attempt.score / maxScore) * 100)
      : 0);
  const totalQs = summary?.totalQuestions ?? questions.length;
  const attemptedCount = summary?.attemptedCount ?? 0;
  const correctCount = summary?.correctCount ?? 0;
  const wrongCount = summary?.wrongCount ?? 0;
  const unansweredCount = summary?.unansweredCount ?? Math.max(0, totalQs - attemptedCount);
  const pieData = [
    { name: "Correct", value: correctCount, color: "var(--verified)" },
    { name: "Wrong", value: wrongCount, color: "var(--danger)" },
    { name: "Unanswered", value: unansweredCount, color: "var(--border-strong)" },
  ].filter((d) => d.value > 0);

  const verifyUrl =
    typeof window !== "undefined" && verifyCode
      ? `${window.location.origin}/verify/${encodeURIComponent(verifyCode)}`
      : verifyCode
      ? `/verify/${encodeURIComponent(verifyCode)}`
      : "";

  function handleDisputeSubmit(e: FormEvent) {
    e.preventDefault();
    if (disputeReason.trim().length < 5) {
      toast.error("Please describe your reason (at least 5 characters)");
      return;
    }
    disputeMut.mutate({
      attemptId,
      questionId: disputeTargetQId ?? null,
      type: disputeType,
      reason: disputeReason.trim(),
    });
  }

  return (
    <AppShell
      title={data?.exam?.title ? `Result: ${data.exam.title}` : "Examination Result & Receipts"}
      subtitle="Verified score breakdown, signed cryptographic receipts, and dispute submission."
      actions={
        attempt && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await api.reports.downloadAttemptPdf(attempt.id, verifyCode);
                  toast.success("Result PDF downloaded");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <FileDown className="h-4 w-4" /> Download Result PDF
            </Button>
            {user?.role === "CANDIDATE" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDisputeTargetQId(null);
                  setDisputeType("TECHNICAL");
                }}
              >
                <FileWarning className="h-4 w-4" /> Raise Technical Dispute
              </Button>
            )}
          </>
        )
      }
    >
      {resultQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
          <Spinner /> Loading verified result…
        </div>
      ) : resultQuery.error || !attempt ? (
        <Card>
          <CardContent className="text-sm text-danger">
            {(resultQuery.error as Error)?.message ?? "Result is not yet available or published."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Score, Donut Chart, Progress Bars & Verifiable QR Summary (EMS ShowResult + VeriExam) */}
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="space-y-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Badge tone="verified">{attempt.status}</Badge>
                      {summary?.timeTakenMin && (
                        <Badge tone="neutral">
                          <Clock className="h-3 w-3" /> {summary.timeTakenMin} min taken
                        </Badge>
                      )}
                    </div>
                    <p className="text-3xl font-medium font-mono tabular-nums tracking-tight">
                      {attempt.score !== null && attempt.score !== undefined
                        ? `${attempt.score} / ${maxScore}`
                        : `Pending / ${maxScore}`}
                      <span className="ml-2 text-lg font-medium text-accent">
                        ({scorePct}%)
                      </span>
                    </p>
                    <p className="text-xs text-ink-muted">
                      Submitted:{" "}
                      {attempt.submitted_at ?? attempt.submittedAt
                        ? new Date(attempt.submitted_at ?? attempt.submittedAt ?? "").toLocaleString()
                        : "—"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {verifyCode && (
                      <Link href={`/verify/${encodeURIComponent(verifyCode)}`}>
                        <Button variant="verified" size="sm">
                          <ShieldCheck className="h-4 w-4" /> Public Certificate
                        </Button>
                      </Link>
                    )}
                    <Link href={`/verify?attemptId=${encodeURIComponent(attempt.id)}`}>
                      <Button variant="secondary" size="sm">
                        Inspect Hash Chain <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Progress Bars + Marks Distribution Donut */}
                {totalQs > 0 && (
                  <div className="grid gap-4 sm:grid-cols-[180px_1fr] items-center border-t border-border pt-4">
                    <div className="h-36 w-full">
                      {pieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={38}
                              outerRadius={60}
                              paddingAngle={2}
                            >
                              {pieData.map((entry, idx) => (
                                <Cell key={idx} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                background: "var(--surface)",
                                borderColor: "var(--border)",
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-ink-subtle">
                          No chart data
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <div className="flex justify-between font-medium mb-1">
                          <span>Overall Score</span>
                          <span className="font-mono">{scorePct}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full bg-accent transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, scorePct))}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between font-medium mb-1">
                          <span>Attempted Questions</span>
                          <span className="font-mono">
                            {attemptedCount} / {totalQs} (
                            {Math.round((attemptedCount / totalQs) * 100)}%)
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full bg-warning transition-all"
                            style={{
                              width: `${Math.round((attemptedCount / totalQs) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between font-medium mb-1">
                          <span>Correct Answers</span>
                          <span className="font-mono text-verified">
                            {correctCount} / {totalQs} (
                            {Math.round((correctCount / totalQs) * 100)}%)
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full bg-verified transition-all"
                            style={{
                              width: `${Math.round((correctCount / totalQs) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {verifyCode && (
              <Card>
                <CardContent className="flex items-center gap-4">
                  <div className="rounded-lg border border-border bg-white p-2 shrink-0">
                    <QRCodeSVG value={verifyUrl || verifyCode} size={78} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-ink-subtle">
                      Verifiable QR Code
                    </p>
                    <p className="font-mono text-sm font-bold text-accent truncate">
                      {verifyCode}
                    </p>
                    <p className="text-[11px] text-ink-muted mt-0.5">
                      Scan to verify authenticity publicly with zero private data exposed.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Question-by-Question Review */}
          <Card>
            <CardHeader>
              <h2 className="font-display text-sm font-semibold uppercase tracking-[0.05em]">
                Question Breakdown ({questions.length})
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {questions.map((q, idx) => {
                const grade = data?.grades?.find(
                  (g) => (g.questionId ?? g.question_id) === q.id
                );
                const saved = data?.savedAnswers?.find(
                  (a) => (a.questionId ?? a.question_id) === q.id
                );
                const awarded = grade?.awarded ?? q.awarded;
                const feedback = grade?.feedback ?? q.feedback;
                const selected = q.selected ?? saved?.selected;
                const correctIds = new Set(q.correctOptionIds ?? q.correct_option_ids ?? []);
                const selectedSet = new Set(Array.isArray(selected) ? selected : []);

                return (
                  <div
                    key={q.id}
                    className="rounded-sm border border-border bg-surface-subtle p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge tone="accent">Q{idx + 1}</Badge>
                        <Badge tone="neutral">{q.type}</Badge>
                        <Badge
                          tone={
                            awarded === null || awarded === undefined
                              ? "warning"
                              : awarded >= q.marks
                              ? "verified"
                              : awarded > 0
                              ? "accent"
                              : "danger"
                          }
                        >
                          {awarded ?? "Pending"} / {q.marks} pts
                        </Badge>
                      </div>

                      {user?.role === "CANDIDATE" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setDisputeTargetQId(q.id);
                            setDisputeType("GRADING");
                          }}
                        >
                          <FileWarning className="h-3.5 w-3.5" /> Dispute Question
                        </Button>
                      )}
                    </div>

                    <p className="text-sm font-medium text-foreground">{q.text}</p>

                    {q.options && q.options.length > 0 ? (
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {q.options.map((opt) => {
                          const isCorr = correctIds.has(opt.id);
                          const isSel = selectedSet.has(opt.id);
                          return (
                            <div
                              key={opt.id}
                              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                                isCorr
                                  ? "border-verified/40 bg-verified-soft text-verified font-medium"
                                  : isSel && !isCorr
                                  ? "border-danger/40 bg-danger-soft text-danger"
                                  : "border-border bg-surface text-ink-muted"
                              }`}
                            >
                              <span>{opt.text}</span>
                              <span className="shrink-0 flex items-center gap-1">
                                {isSel && <span className="text-[10px] uppercase font-bold">Yours</span>}
                                {isCorr && <CheckCircle2 className="h-3.5 w-3.5" />}
                                {isSel && !isCorr && <XCircle className="h-3.5 w-3.5" />}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border bg-surface p-3 text-xs">
                        <p className="font-semibold text-ink-subtle mb-1">Your Response:</p>
                        <p className="whitespace-pre-wrap">{String(selected || "(No response)")}</p>
                      </div>
                    )}

                    {q.explanation && (
                      <p className="text-xs text-ink-muted">
                        <strong>Explanation:</strong> {q.explanation}
                      </p>
                    )}

                    {feedback && (
                      <p className="text-xs text-accent">
                        <strong>Examiner Feedback:</strong> {feedback}
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Signed Receipts Audit Ledger */}
          <Card>
            <CardHeader>
              <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.05em]">
                <ShieldCheck className="h-4 w-4 text-verified" />
                Signed Cryptographic Receipts ({receipts.length})
              </h2>
            </CardHeader>
            <CardContent className="p-0">
              {receipts.length === 0 ? (
                <p className="p-5 text-sm text-ink-muted">No receipts recorded.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border bg-surface-subtle text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                      <tr>
                        <th className="px-4 py-2.5">Seq</th>
                        <th className="px-4 py-2.5">Server Time</th>
                        <th className="px-4 py-2.5">Answer SHA-256 Hash</th>
                        <th className="px-4 py-2.5">HMAC Signature</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono">
                      {receipts.map((r) => (
                        <tr key={`${r.clientSeq}-${r.sig}`}>
                          <td className="px-4 py-2.5 font-semibold">#{r.clientSeq}</td>
                          <td className="px-4 py-2.5 font-sans text-ink-muted">
                            {new Date(r.serverTime).toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 max-w-[200px] truncate" title={r.answerHash}>
                            {r.answerHash}
                          </td>
                          <td className="px-4 py-2.5 max-w-[200px] truncate text-ink-subtle" title={r.sig}>
                            {r.sig}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Raise Dispute Modal */}
      {disputeTargetQId !== undefined && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Raise Result Dispute"
        >
          <Card className="w-full max-w-md">
            <CardHeader>
              <h3 className="text-base font-semibold">Raise Evidence-Backed Dispute</h3>
              <p className="text-xs text-ink-muted">
                Your hash-chained saves, disconnect timestamps, and signed receipts are attached automatically for examiner review.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleDisputeSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="d-type">Dispute Category</Label>
                  <Select
                    id="d-type"
                    value={disputeType}
                    onChange={(e) => setDisputeType(e.target.value as DisputeType)}
                  >
                    <option value="GRADING">Grading Error</option>
                    <option value="AMBIGUOUS">Ambiguous Question (Fair Re-score All)</option>
                    <option value="TECHNICAL">Technical / Connectivity Incident</option>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="d-reason">Detailed Explanation</Label>
                  <Textarea
                    id="d-reason"
                    required
                    rows={4}
                    placeholder="Explain the grading concern, ambiguity, or technical issue…"
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setDisputeTargetQId(undefined)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={disputeMut.isPending}>
                    {disputeMut.isPending ? <Spinner /> : "Submit Dispute"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
