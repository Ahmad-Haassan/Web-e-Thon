"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
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
  BarChart3,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Spinner,
} from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import type {
  ExaminerExamSummary,
  ExaminerInsightPoint,
} from "@/lib/client/api-types";

interface AnalyticsPanelProps {
  exams: ExaminerExamSummary[];
  insightsSeries: ExaminerInsightPoint[];
  days: 7 | 30;
  onChangeDays: (days: 7 | 30) => void;
  selectedExamId?: string;
  onSelectExam: (examId: string) => void;
}

export function AnalyticsPanel({
  exams,
  insightsSeries,
  days,
  onChangeDays,
  selectedExamId,
  onSelectExam,
}: AnalyticsPanelProps) {
  const qc = useQueryClient();

  const activeExam =
    exams.find((e) => e.id === selectedExamId) ??
    exams.find((e) => e.submittedCount > 0) ??
    exams[0] ??
    null;

  const examAnalyticsQuery = useQuery({
    queryKey: ["examiner-analytics-detail", activeExam?.id],
    queryFn: () => api.exams.analytics(activeExam!.id),
    enabled: Boolean(activeExam?.id),
  });

  const fairnessQuery = useQuery({
    queryKey: ["examiner-fairness-detail", activeExam?.id],
    queryFn: () => api.exams.fairness(activeExam!.id),
    enabled: Boolean(activeExam?.id),
  });

  const revealSeedMut = useMutation({
    mutationFn: (examId: string) => api.exams.update(examId, { revealSeed: true }),
    onSuccess: () => {
      toast.success("Randomization audit seed revealed");
      qc.invalidateQueries({ queryKey: ["examiner-fairness-detail", activeExam?.id] });
      qc.invalidateQueries({ queryKey: ["examiner-overview"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const comparisonData = exams
    .filter((e) => e.submittedCount > 0)
    .slice(0, 8)
    .map((e) => ({
      name: e.title.length > 18 ? e.title.slice(0, 16) + "…" : e.title,
      avgPct: e.avgPct ?? 0,
      passRate: e.passRate ?? 0,
    }));

  const questionAnalytics = examAnalyticsQuery.data?.questionAnalytics ?? [];
  const similarityFlags = examAnalyticsQuery.data?.writtenSimilarityFlags ?? [];
  const fairness = fairnessQuery.data;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            Question Analytics &amp; Fairness Insights
          </h1>
          <p className="text-sm text-slate-500">
            Cross-exam trends, question psychometrics, ambiguity auto-detection, and cryptographic seed fairness.
          </p>
        </div>

        <select
          aria-label="Trend window"
          value={days}
          onChange={(e) => onChangeDays(Number(e.target.value) as 7 | 30)}
          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
        >
          <option value={7}>Last 7 Days</option>
          <option value={30}>Last 30 Days</option>
        </select>
      </div>

      {/* Top Row Charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
          <h2 className="mb-3 text-sm font-bold text-slate-900">
            Attempts &amp; Pass Rate Trend ({days} Days)
          </h2>
          <div className="h-60 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={insightsSeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="pct"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                />
                <YAxis
                  yAxisId="count"
                  orientation="right"
                  hide
                  allowDecimals={false}
                  domain={[0, "dataMax + 2"]}
                />
                <Tooltip />
                <Area
                  yAxisId="count"
                  type="monotone"
                  dataKey="attempts"
                  name="Attempts"
                  stroke="#2563eb"
                  fill="#dbeafe"
                  strokeWidth={2}
                />
                <Area
                  yAxisId="pct"
                  type="monotone"
                  dataKey="passRate"
                  name="Pass Rate (%)"
                  stroke="#10b981"
                  fill="#d1fae5"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
          <h2 className="mb-3 text-sm font-bold text-slate-900">
            Per-Exam Performance (Avg % vs Pass Rate %)
          </h2>
          {comparisonData.length === 0 ? (
            <div className="flex h-60 items-center justify-center text-xs text-slate-500">
              No submitted attempts across exams yet.
            </div>
          ) : (
            <div className="h-60 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip />
                  <Bar dataKey="avgPct" name="Avg Score %" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="passRate" name="Pass Rate %" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Exam Deep-Dive */}
      {!activeExam ? (
        <EmptyState
          title="No examinations found"
          description="Create an exam to view question psychometrics and fairness audits."
        />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="analytics-exam-select"
                className="text-xs font-semibold text-slate-600"
              >
                Inspect Exam Psychometrics:
              </label>
              <select
                id="analytics-exam-select"
                value={activeExam.id}
                onChange={(e) => onSelectExam(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
              >
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title} ({ex.submittedCount} submitted)
                  </option>
                ))}
              </select>
            </div>

            <Link href={`/examiner/exams/${activeExam.id}`}>
              <Button size="sm" variant="secondary">
                Open Full Exam Hub
              </Button>
            </Link>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {/* Question Psychometrics */}
            <Card className="rounded-2xl border-slate-200/80 shadow-2xs lg:col-span-2">
              <CardHeader>
                <h3 className="text-base font-bold text-slate-900">
                  Question Psychometrics &amp; Ambiguity Auto-Detection
                </h3>
                <p className="text-xs text-slate-500">
                  Flags items with &lt;25% correct rate or where a wrong distractor fooled more candidates than the key.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {examAnalyticsQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500">
                    <Spinner /> Computing psychometrics…
                  </div>
                ) : questionAnalytics.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No submitted responses yet for this examination.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-100 bg-slate-50 uppercase text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Question</th>
                          <th className="px-4 py-3">% Correct</th>
                          <th className="px-4 py-3">Skip Rate</th>
                          <th className="px-4 py-3">Difficulty</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {questionAnalytics.map((qa, idx) => {
                          const pct = qa.pctCorrect ?? qa.correctRate ?? 0;
                          const skip = qa.skipRate ?? 0;
                          const fmtPct = (v: number) => `${Math.round(v <= 1 ? v * 100 : v)}%`;
                          const flagged =
                            qa.ambiguityFlag || (qa.ambiguityFlags?.length ?? 0) > 0;
                          return (
                            <tr key={qa.questionId ?? qa.id ?? idx}>
                              <td className="max-w-sm px-4 py-3">
                                <p className="line-clamp-2 text-sm font-medium text-slate-900">
                                  {qa.text ?? qa.questionId}
                                </p>
                                {qa.mostCommonWrongOption && (
                                  <p className="mt-0.5 text-[11px] text-slate-500">
                                    Top distractor: {qa.mostCommonWrongOption}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono font-semibold">
                                {fmtPct(pct)}
                              </td>
                              <td className="px-4 py-3 font-mono">{fmtPct(skip)}</td>
                              <td className="px-4 py-3 font-mono">
                                {qa.difficultyIndex !== undefined
                                  ? Number(qa.difficultyIndex).toFixed(2)
                                  : "—"}
                              </td>
                              <td className="px-4 py-3">
                                {flagged ? (
                                  <Badge tone="warning">
                                    <AlertTriangle className="h-3 w-3" />
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
                )}
              </CardContent>
            </Card>

            {/* Cryptographic Fairness & Seed Audit */}
            <Card className="rounded-2xl border-slate-200/80 shadow-2xs">
              <CardHeader>
                <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Fairness &amp; Seed Audit
                </h3>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div>
                  <p className="font-semibold uppercase text-slate-400">
                    Seed Commitment (SHA-256)
                  </p>
                  <p className="mt-1 break-all rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-700">
                    {fairness?.seedCommitment ?? activeExam.seedCommitment ?? "—"}
                  </p>
                </div>

                {(fairness?.seedRevealed ?? fairness?.seedReveal) && (
                  <div>
                    <p className="font-semibold uppercase text-emerald-600">Revealed Seed</p>
                    <p className="mt-1 break-all rounded-lg border border-emerald-200 bg-emerald-50 p-2 font-mono text-[11px] text-emerald-800">
                      {fairness?.seedRevealed ?? fairness?.seedReveal}
                    </p>
                  </div>
                )}

                {fairness && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <p className="text-slate-500">Papers Audited</p>
                      <p className="text-base font-bold font-mono text-slate-900">
                        {fairness.attemptsCount}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <p className="text-slate-500">Difficulty Spread</p>
                      <p className="text-base font-bold font-mono text-slate-900">
                        {fairness.spread !== null && fairness.spread !== undefined
                          ? Number(fairness.spread).toFixed(3)
                          : "—"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <p className="text-slate-500">Min / Max Balance</p>
                      <p className="font-mono font-semibold text-slate-800">
                        {fairness.min !== null ? Number(fairness.min).toFixed(2) : "—"} /{" "}
                        {fairness.max !== null ? Number(fairness.max).toFixed(2) : "—"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <p className="text-slate-500">Mean Balance</p>
                      <p className="font-mono font-semibold text-slate-800">
                        {fairness.mean !== null ? Number(fairness.mean).toFixed(2) : "—"}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={
                      revealSeedMut.isPending ||
                      Boolean(fairness?.seedRevealed ?? fairness?.seedReveal ?? activeExam.seedRevealed)
                    }
                    onClick={() => revealSeedMut.mutate(activeExam.id)}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    {fairness?.seedRevealed ?? fairness?.seedReveal ?? activeExam.seedRevealed
                      ? "Seed Revealed"
                      : "Reveal Audit Seed"}
                  </Button>
                  <Link href={`/verify?examId=${encodeURIComponent(activeExam.id)}`}>
                    <Button size="sm" variant="ghost">
                      Public Audit →
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Written Similarity Flags */}
          {similarityFlags.length > 0 && (
            <Card className="rounded-2xl border-amber-200 bg-amber-50/40 shadow-2xs">
              <CardHeader>
                <h3 className="flex items-center gap-2 text-sm font-bold text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Written Response Similarity Indicators (For Human Review Only)
                </h3>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {similarityFlags.map((flag, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white px-3.5 py-2.5"
                  >
                    <span className="font-medium text-slate-800">
                      {flag.candidateA} ↔ {flag.candidateB}
                    </span>
                    <Badge tone="warning">{flag.similarityPct}% lexical overlap</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
