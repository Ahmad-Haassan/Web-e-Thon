"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardEdit,
  FileDown,
  LayoutGrid,
  ShieldCheck,
  Table as TableIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Input,
  Label,
  Spinner,
  StatCard,
  Textarea,
} from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import type { AttemptResultResponse } from "@/lib/client/api-types";

export function GradingAnalyticsTab({ examId }: { examId: string }) {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [gradingAttemptId, setGradingAttemptId] = useState<string | null>(null);
  const [gradeInputs, setGradeInputs] = useState<Record<string, { awarded: string; feedback: string }>>({});

  const analyticsQuery = useQuery({
    queryKey: ["exam-analytics", examId],
    queryFn: () => api.exams.analytics(examId),
  });

  const attemptDetailQuery = useQuery({
    queryKey: ["attempt-grade-detail", gradingAttemptId],
    queryFn: () => api.attempts.result(gradingAttemptId!),
    enabled: Boolean(gradingAttemptId),
  });

  const gradeMut = useMutation({
    mutationFn: ({
      attemptId,
      questionId,
      awarded,
      feedback,
    }: {
      attemptId: string;
      questionId: string;
      awarded: number;
      feedback?: string;
    }) => api.attempts.grade(attemptId, { questionId, awarded, feedback }),
    onSuccess: (res) => {
      toast.success(
        `Grade saved · ${res.pendingManualCount} written item(s) remaining`
      );
      qc.invalidateQueries({ queryKey: ["attempt-grade-detail", gradingAttemptId] });
      qc.invalidateQueries({ queryKey: ["exam-analytics", examId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const analytics = analyticsQuery.data;

  const chartData = (analytics?.summary.distribution ?? []).map((b, i) => ({
    name: b.label ?? b.bucket ?? b.range ?? `Band ${i + 1}`,
    count: b.count,
  }));

  function getQuestionRows(res: AttemptResultResponse | undefined) {
    return res?.questionsWithExplanations ?? res?.questions ?? [];
  }

  return (
    <div className="space-y-5">
      {analyticsQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-muted">
          <Spinner /> Computing exam analytics &amp; grading queue…
        </div>
      ) : analyticsQuery.error ? (
        <Card>
          <CardContent className="text-sm text-danger">
            {(analyticsQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : !analytics ? null : (
        <>
          {/* Summary KPIs */}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Total submitted" value={analytics.summary.totalSubmitted} />
            <StatCard
              label="Average score"
              value={
                analytics.summary.avg !== null && analytics.summary.avg !== undefined
                  ? Number(analytics.summary.avg).toFixed(1)
                  : "—"
              }
            />
            <StatCard
              label="Pass rate"
              tone="verified"
              value={
                analytics.summary.passRate !== null && analytics.summary.passRate !== undefined
                  ? `${Math.round(Number(analytics.summary.passRate) * (Number(analytics.summary.passRate) <= 1 ? 100 : 1))}%`
                  : "—"
              }
            />
          </div>

          {/* Score Distribution Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-base font-semibold">Score Distribution</h3>
              </CardHeader>
              <CardContent>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--ink-muted)" }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--ink-muted)" }} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--surface)",
                          borderColor: "var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="count" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Candidate Results & Manual Grading (EMS Marks Cards + Table Toggle) */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold">
                    Student Marks Analysis &amp; Grading ({analytics.candidates.length})
                  </h3>
                  <p className="text-xs text-ink-muted">
                    MCQs are auto-graded atomically. Switch between Marks Breakdown Cards and compact Table view, or click <strong>Grade / Inspect</strong>.
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-subtle p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode("cards")}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                      viewMode === "cards"
                        ? "bg-accent text-accent-ink"
                        : "text-ink-muted hover:text-foreground"
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" /> Marks Cards
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                      viewMode === "table"
                        ? "bg-accent text-accent-ink"
                        : "text-ink-muted hover:text-foreground"
                    }`}
                  >
                    <TableIcon className="h-3.5 w-3.5" /> Table
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={viewMode === "table" ? "p-0" : "p-5"}>
              {analytics.candidates.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No submissions yet"
                    description="Submitted and expired candidate attempts will appear here."
                  />
                </div>
              ) : viewMode === "cards" ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {analytics.candidates.map((c) => {
                    const attId = c.attemptId ?? c.id ?? "";
                    const max = c.maxScore ?? c.max_score ?? 0;
                    const code = c.verifyCode ?? c.verify_code ?? "";
                    const cls = c.candidate?.class_name;
                    const sec = c.candidate?.section;
                    return (
                      <div
                        key={attId}
                        className="flex flex-col justify-between rounded-xl border border-border bg-surface-subtle p-4 space-y-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-sm text-foreground uppercase tracking-tight">
                              {c.candidate?.name ?? c.name ?? "Candidate"}
                            </p>
                            <Badge
                              tone={
                                c.status === "GRADED"
                                  ? "verified"
                                  : (c.pendingManualCount ?? 0) > 0
                                  ? "warning"
                                  : "accent"
                              }
                            >
                              {c.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-ink-subtle truncate">
                            {c.candidate?.email ?? c.email ?? ""}
                            {cls ? ` · Class ${cls}${sec ? `-${sec}` : ""}` : ""}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface p-3 text-xs">
                          <div>
                            <span className="text-ink-subtle block">Obtained / Total</span>
                            <span className="font-mono font-bold text-foreground">
                              {c.score !== null && c.score !== undefined ? c.score : "—"} / {max}
                            </span>
                          </div>
                          <div>
                            <span className="text-ink-subtle block">Time Taken</span>
                            <span className="font-mono font-semibold text-foreground">
                              {c.timeTakenMin ? `${c.timeTakenMin} min` : "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-ink-subtle block">Correct</span>
                            <span className="font-mono font-bold text-verified">
                              {c.correctCount ?? 0}
                            </span>
                          </div>
                          <div>
                            <span className="text-ink-subtle block">Wrong / Skipped</span>
                            <span className="font-mono font-bold text-danger">
                              {c.wrongCount ?? 0}
                            </span>
                            <span className="text-ink-subtle"> / </span>
                            <span className="font-mono font-semibold text-ink-muted">
                              {c.unansweredCount ?? 0}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-1.5 pt-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setGradingAttemptId(attId)}
                          >
                            <ClipboardEdit className="h-3.5 w-3.5" /> Grade / Inspect
                          </Button>
                          <div className="flex items-center gap-1">
                            <Link href={`/verify?attemptId=${encodeURIComponent(attId)}`}>
                              <Button size="sm" variant="ghost" title="Verify Hash Chain">
                                <ShieldCheck className="h-3.5 w-3.5 text-verified" />
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Download Candidate Result PDF"
                              onClick={async () => {
                                try {
                                  await api.reports.downloadAttemptPdf(attId, code);
                                  toast.success("Candidate result PDF downloaded");
                                } catch (e) {
                                  toast.error((e as Error).message);
                                }
                              }}
                            >
                              <FileDown className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-surface-subtle text-xs font-medium text-ink-muted">
                      <tr>
                        <th className="px-4 py-3 font-medium">Candidate</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Score</th>
                        <th className="px-4 py-3 font-medium">Correct / wrong / skip</th>
                        <th className="px-4 py-3 font-medium">Verify code</th>
                        <th className="px-4 py-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {analytics.candidates.map((c) => {
                        const attId = c.attemptId ?? c.id ?? "";
                        const max = c.maxScore ?? c.max_score ?? 0;
                        const code = c.verifyCode ?? c.verify_code ?? "";
                        return (
                          <tr key={attId} className="hover:bg-surface-subtle/60">
                            <td className="px-4 py-3">
                              <p className="font-medium text-foreground">
                                {c.candidate?.name ?? c.name ?? "Candidate"}
                              </p>
                              <p className="text-xs text-ink-subtle">
                                {c.candidate?.email ?? c.email ?? ""}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                tone={
                                  c.status === "GRADED"
                                    ? "verified"
                                    : (c.pendingManualCount ?? 0) > 0
                                    ? "warning"
                                    : "accent"
                                }
                              >
                                {c.status}
                                {(c.pendingManualCount ?? 0) > 0
                                  ? ` (${c.pendingManualCount} pending)`
                                  : ""}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 font-mono font-semibold">
                              {c.score !== null && c.score !== undefined
                                ? `${c.score} / ${max}`
                                : `Pending / ${max}`}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">
                              <span className="text-verified font-semibold">{c.correctCount ?? 0}</span>
                              {" / "}
                              <span className="text-danger font-semibold">{c.wrongCount ?? 0}</span>
                              {" / "}
                              <span className="text-ink-muted">{c.unansweredCount ?? 0}</span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">
                              {code ? (
                                <Link
                                  href={`/verify/${encodeURIComponent(code)}`}
                                  className="text-accent hover:underline"
                                >
                                  {code}
                                </Link>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setGradingAttemptId(attId)}
                                >
                                  <ClipboardEdit className="h-3.5 w-3.5" /> Grade / Inspect
                                </Button>
                                <Link href={`/verify?attemptId=${encodeURIComponent(attId)}`}>
                                  <Button size="sm" variant="ghost" title="Verify Hash Chain">
                                    <ShieldCheck className="h-3.5 w-3.5 text-verified" />
                                  </Button>
                                </Link>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Download Candidate Result PDF"
                                  onClick={async () => {
                                    try {
                                      await api.reports.downloadAttemptPdf(attId, code);
                                      toast.success("Candidate result PDF downloaded");
                                    } catch (e) {
                                      toast.error((e as Error).message);
                                    }
                                  }}
                                >
                                  <FileDown className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Question Analytics Table */}
          {analytics.questionAnalytics.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-base font-semibold">Question Psychometrics &amp; Ambiguity Detection</h3>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border bg-surface-subtle uppercase tracking-wide text-ink-muted">
                      <tr>
                        <th className="px-4 py-3">Question</th>
                        <th className="px-4 py-3">% Correct</th>
                        <th className="px-4 py-3">Skip Rate</th>
                        <th className="px-4 py-3">Difficulty Index</th>
                        <th className="px-4 py-3">Flags</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {analytics.questionAnalytics.map((qa, idx) => {
                        const pct = qa.pctCorrect ?? qa.correctRate ?? 0;
                        const skip = qa.skipRate ?? 0;
                        const fmtPct = (v: number) => `${Math.round(v <= 1 ? v * 100 : v)}%`;
                        const flagged = qa.ambiguityFlag || (qa.ambiguityFlags?.length ?? 0) > 0;
                        return (
                          <tr key={qa.questionId ?? qa.id ?? idx}>
                            <td className="px-4 py-3 max-w-md">
                              <p className="font-medium text-foreground text-sm line-clamp-2">
                                {qa.text ?? qa.questionId}
                              </p>
                              {qa.mostCommonWrongOption && (
                                <p className="text-ink-subtle mt-0.5">
                                  Most common wrong choice: {qa.mostCommonWrongOption}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono">{fmtPct(pct)}</td>
                            <td className="px-4 py-3 font-mono">{fmtPct(skip)}</td>
                            <td className="px-4 py-3 font-mono">
                              {qa.difficultyIndex !== undefined
                                ? Number(qa.difficultyIndex).toFixed(2)
                                : "—"}
                            </td>
                            <td className="px-4 py-3">
                              {flagged ? (
                                <Badge tone="warning">
                                  <AlertTriangle className="h-3 w-3" />{" "}
                                  {qa.ambiguityFlags?.join(", ") || "Review Ambiguity"}
                                </Badge>
                              ) : (
                                <Badge tone="verified">
                                  <CheckCircle2 className="h-3 w-3" /> Healthy
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Manual Grading & Attempt Inspection Modal */}
      {gradingAttemptId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Manual Grading Drawer"
        >
          <Card className="w-full max-w-3xl max-h-[85vh] flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">Manual Grading &amp; Answer Inspection</h3>
                  <p className="text-xs text-ink-muted">
                    Award scores validated against 0..maxMarks. Totals recompute atomically on the server.
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setGradingAttemptId(null)}>
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-y-auto space-y-4">
              {attemptDetailQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-ink-muted">
                  <Spinner /> Loading candidate submission…
                </div>
              ) : attemptDetailQuery.error ? (
                <p className="text-sm text-danger">
                  {(attemptDetailQuery.error as Error).message}
                </p>
              ) : (
                getQuestionRows(attemptDetailQuery.data).map((q, idx) => {
                  const gradeRow = attemptDetailQuery.data?.grades?.find(
                    (g) => (g.questionId ?? g.question_id) === q.id
                  );
                  const savedAns = attemptDetailQuery.data?.savedAnswers?.find(
                    (a) => (a.questionId ?? a.question_id) === q.id
                  );
                  const currentSelected = q.selected ?? savedAns?.selected;
                  const currentAwarded = gradeRow?.awarded ?? q.awarded;
                  const inputState = gradeInputs[q.id] ?? {
                    awarded: currentAwarded !== null && currentAwarded !== undefined ? String(currentAwarded) : "",
                    feedback: gradeRow?.feedback ?? q.feedback ?? "",
                  };

                  return (
                    <div
                      key={q.id}
                      className="rounded-lg border border-border bg-surface-subtle p-4 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge tone="accent">Q{idx + 1}</Badge>
                          <Badge tone="neutral">{q.type}</Badge>
                          <span className="text-xs font-mono text-ink-muted">
                            Max: {q.marks} pts
                          </span>
                        </div>
                        <Badge
                          tone={
                            gradeRow?.isPendingManual || gradeRow?.is_pending_manual
                              ? "warning"
                              : "verified"
                          }
                        >
                          Awarded: {currentAwarded ?? "Pending"} / {q.marks}
                        </Badge>
                      </div>

                      <p className="text-sm font-medium text-foreground">{q.text}</p>

                      <div className="rounded-md border border-border bg-surface p-2.5 text-xs">
                        <p className="font-semibold text-ink-subtle mb-1">Candidate Response:</p>
                        <p className="whitespace-pre-wrap text-foreground">
                          {Array.isArray(currentSelected)
                            ? currentSelected
                                .map(
                                  (optId) =>
                                    q.options?.find((o) => o.id === optId)?.text ?? optId
                                )
                                .join(", ") || "(No selection)"
                            : String(currentSelected || "(No response)")}
                        </p>
                      </div>

                      {q.writtenRubric && (
                        <p className="text-xs text-ink-muted">
                          <strong>Rubric:</strong> {q.writtenRubric}
                        </p>
                      )}

                      <div className="grid gap-2 sm:grid-cols-3 items-end pt-1">
                        <div>
                          <Label>Awarded (0 – {q.marks})</Label>
                          <Input
                            type="number"
                            min={0}
                            max={q.marks}
                            step={0.5}
                            value={inputState.awarded}
                            onChange={(e) =>
                              setGradeInputs((prev) => ({
                                ...prev,
                                [q.id]: { ...inputState, awarded: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div className="sm:col-span-2 flex gap-2 items-end">
                          <div className="flex-1">
                            <Label>Feedback</Label>
                            <Textarea
                              rows={1}
                              value={inputState.feedback}
                              onChange={(e) =>
                                setGradeInputs((prev) => ({
                                  ...prev,
                                  [q.id]: { ...inputState, feedback: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <Button
                            size="sm"
                            disabled={gradeMut.isPending}
                            onClick={() => {
                              const val = Number(inputState.awarded);
                              if (Number.isNaN(val) || val < 0 || val > q.marks) {
                                toast.error(`Awarded marks must be between 0 and ${q.marks}`);
                                return;
                              }
                              gradeMut.mutate({
                                attemptId: gradingAttemptId,
                                questionId: q.id,
                                awarded: val,
                                feedback: inputState.feedback,
                              });
                            }}
                          >
                            Save Grade
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
