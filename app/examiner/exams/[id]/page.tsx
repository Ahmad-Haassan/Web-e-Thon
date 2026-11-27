"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Eye,
  FileDown,
  FlaskConical,
  KeyRound,
  Send,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { EnrollmentsTab } from "@/components/examiner/enrollments-tab";
import { GradingAnalyticsTab } from "@/components/examiner/grading-analytics-tab";
import { MonitorTab } from "@/components/examiner/monitor-tab";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Spinner,
} from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import {
  computeClientLifecycle,
  examDurationMin,
  examEndAt,
  examGraceSec,
  examResultsPublished,
  examStartAt,
  examTotalMarks,
} from "@/lib/client/api-types";

type TabId = "overview" | "enrollments" | "monitor" | "grading";

function ExaminerExamHubInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();

  const examId = params.id;
  const initialTab = (searchParams.get("tab") as TabId) || "overview";
  const [tab, setTab] = useState<TabId>(
    ["overview", "enrollments", "monitor", "grading"].includes(initialTab)
      ? initialTab
      : "overview"
  );

  const detailQuery = useQuery({
    queryKey: ["exam-detail", examId],
    queryFn: () => api.exams.get(examId),
    enabled: Boolean(examId),
  });

  const fairnessQuery = useQuery({
    queryKey: ["exam-fairness", examId],
    queryFn: () => api.exams.fairness(examId),
    enabled: Boolean(examId) && tab === "overview",
  });

  const updateExamMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.exams.update(examId, body),
    onSuccess: () => {
      toast.success("Exam updated");
      qc.invalidateQueries({ queryKey: ["exam-detail", examId] });
      qc.invalidateQueries({ queryKey: ["exam-fairness", examId] });
      qc.invalidateQueries({ queryKey: ["examiner-exams"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sandboxMut = useMutation({
    mutationFn: () =>
      api.attempts.start(examId, { isSandbox: true, integrityAck: true }),
    onSuccess: (res) => {
      toast.success("Sandbox preview started (excluded from all exam stats)");
      router.push(`/exam/${res.attempt.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.exams.delete(examId),
    onSuccess: () => {
      toast.success("Exam deleted");
      qc.invalidateQueries({ queryKey: ["examiner-exams"] });
      router.replace("/examiner");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const exam = detailQuery.data?.exam;
  const questions = detailQuery.data?.questions ?? [];
  const fairness = fairnessQuery.data ?? detailQuery.data?.fairnessReport;
  const lifecycle = exam ? computeClientLifecycle(exam) : "DRAFT";
  const resultsPublished = exam ? examResultsPublished(exam) : false;

  return (
    <AppShell
      allowedRoles={["ADMIN", "EXAMINER"]}
      title={exam?.title ?? "Exam Management"}
      subtitle={
        exam
          ? `${lifecycle} · ${examDurationMin(exam)} min · ${examTotalMarks(exam)} marks · ${detailQuery.data?.enrollmentCount ?? 0} enrolled`
          : "Loading exam configuration…"
      }
      actions={
        exam && (
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={sandboxMut.isPending}
              onClick={() => sandboxMut.mutate()}
            >
              <FlaskConical className="h-3.5 w-3.5" /> Sandbox Preview
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await api.reports.downloadExamPdf(exam.id, exam.title);
                  toast.success("Exam summary PDF downloaded");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <FileDown className="h-3.5 w-3.5" /> Summary PDF
            </Button>
            {exam.status === "DRAFT" && (
              <Button
                variant="verified"
                size="sm"
                disabled={updateExamMut.isPending}
                onClick={() => updateExamMut.mutate({ status: "PUBLISHED" })}
              >
                <Send className="h-3.5 w-3.5" /> Publish Exam
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={deleteMut.isPending}
              onClick={() => {
                if (window.confirm(`Delete "${exam.title}" permanently? This cannot be undone.`)) {
                  deleteMut.mutate();
                }
              }}
              title="Delete exam"
            >
              <Trash2 className="h-3.5 w-3.5 text-danger" />
            </Button>
          </>
        )
      }
    >
      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-1.5 border-b border-border pb-3">
        {(
          [
            { id: "overview", label: "Overview & Fairness", icon: <Eye className="h-4 w-4" /> },
            { id: "enrollments", label: "Enrollments & CSV", icon: <Users className="h-4 w-4" /> },
            { id: "monitor", label: "Live Monitor & Alerts", icon: <Activity className="h-4 w-4" /> },
            { id: "grading", label: "Grading & Analytics", icon: <BarChart3 className="h-4 w-4" /> },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer ${
              tab === t.id
                ? "bg-accent text-accent-ink"
                : "bg-surface text-ink-muted border border-border hover:bg-surface-muted hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {detailQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
          <Spinner /> Loading exam hub…
        </div>
      ) : detailQuery.error || !exam ? (
        <Card>
          <CardContent className="text-sm text-danger">
            {(detailQuery.error as Error)?.message ?? "Exam not found"}
          </CardContent>
        </Card>
      ) : tab === "overview" ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">Lifecycle &amp; Result Controls</h3>
                  <Badge tone={lifecycle === "ONGOING" ? "verified" : "accent"}>{lifecycle}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div className="rounded-lg border border-border bg-surface-subtle p-3">
                    <p className="text-xs font-semibold uppercase text-ink-subtle">Opens</p>
                    <p className="mt-0.5 font-medium">
                      {new Date(examStartAt(exam)).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-surface-subtle p-3">
                    <p className="text-xs font-semibold uppercase text-ink-subtle">Closes</p>
                    <p className="mt-0.5 font-medium">
                      {new Date(examEndAt(exam)).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-surface-subtle p-3">
                    <p className="text-xs font-semibold uppercase text-ink-subtle">Duration / Grace</p>
                    <p className="mt-0.5 font-medium">
                      {examDurationMin(exam)} min (+{examGraceSec(exam)}s sync grace)
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-surface-subtle p-3">
                    <p className="text-xs font-semibold uppercase text-ink-subtle">Attached Pool</p>
                    <p className="mt-0.5 font-medium">
                      {questions.length} question(s) · {examTotalMarks(exam)} marks
                    </p>
                  </div>
                </div>

                {exam.instructions && (
                  <div className="rounded-lg border border-border bg-surface-subtle p-3.5 text-sm text-ink-muted">
                    <p className="text-xs font-semibold uppercase text-ink-subtle mb-1">
                      Instructions
                    </p>
                    {exam.instructions}
                  </div>
                )}

                {Array.isArray(exam.rules) && exam.rules.length > 0 && (
                  <div className="rounded-lg border border-border bg-surface-subtle p-3.5 text-xs text-ink-muted space-y-1.5">
                    <p className="font-semibold uppercase text-ink-subtle">
                      Test Rules ({exam.rules.length})
                    </p>
                    <ul className="list-disc pl-4 space-y-1">
                      {exam.rules.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    variant={resultsPublished ? "secondary" : "verified"}
                    size="sm"
                    disabled={updateExamMut.isPending}
                    onClick={() =>
                      updateExamMut.mutate({ resultsPublished: !resultsPublished })
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {resultsPublished ? "Unpublish Results" : "Publish Candidate Results"}
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={updateExamMut.isPending || Boolean(exam.seed_reveal ?? exam.seedReveal)}
                    onClick={() => updateExamMut.mutate({ revealSeed: true })}
                  >
                    <KeyRound className="h-4 w-4" />
                    {exam.seed_reveal ?? exam.seedReveal
                      ? "Seed Revealed"
                      : "Reveal Audit Seed"}
                  </Button>

                  <Link href={`/verify?examId=${encodeURIComponent(exam.id)}`}>
                    <Button variant="ghost" size="sm">
                      <ShieldCheck className="h-4 w-4 text-verified" /> Public Exam Audit
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Attached Questions Preview */}
            <Card>
              <CardHeader>
                <h3 className="text-base font-semibold">
                  Exam Questions ({questions.length})
                </h3>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {questions.length === 0 ? (
                  <p className="text-sm text-ink-muted">
                    No fixed questions attached (using blueprint or pending question selection).
                  </p>
                ) : (
                  questions.map((q, i) => (
                    <div
                      key={q.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-subtle p-3 text-sm"
                    >
                      <div>
                        <span className="font-mono text-xs font-semibold text-accent mr-2">
                          Q{i + 1}
                        </span>
                        <span className="font-medium text-foreground">{q.text}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge tone="neutral">{q.type}</Badge>
                        <Badge tone="neutral">{q.marks} pts</Badge>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column: Cryptographic Commitment & Fairness Report */}
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <ShieldCheck className="h-4 w-4 text-verified" /> Fairness &amp; Seed Audit
                </h3>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div>
                  <p className="font-semibold uppercase text-ink-subtle">Seed Commitment (SHA-256)</p>
                  <p className="mt-1 break-all rounded-md border border-border bg-surface-subtle p-2 font-mono text-[11px]">
                    {fairness?.seedCommitment ?? exam.seed_commitment ?? exam.seedCommitment ?? "—"}
                  </p>
                </div>

                {(fairness?.seedRevealed ?? fairness?.seedReveal ?? exam.seed_reveal ?? exam.seedReveal) && (
                  <div>
                    <p className="font-semibold uppercase text-verified">Revealed Seed</p>
                    <p className="mt-1 break-all rounded-md border border-verified/30 bg-verified-soft p-2 font-mono text-[11px] text-verified">
                      {fairness?.seedRevealed ??
                        fairness?.seedReveal ??
                        exam.seed_reveal ??
                        exam.seedReveal}
                    </p>
                  </div>
                )}

                {fairness && (
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="rounded-lg border border-border bg-surface-subtle p-2.5">
                      <p className="text-ink-subtle">Papers Audited</p>
                      <p className="text-base font-bold font-mono">{fairness.attemptsCount}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface-subtle p-2.5">
                      <p className="text-ink-subtle">Difficulty Spread</p>
                      <p className="text-base font-bold font-mono">
                        {fairness.spread !== null && fairness.spread !== undefined
                          ? Number(fairness.spread).toFixed(3)
                          : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface-subtle p-2.5">
                      <p className="text-ink-subtle">Min / Max Balance</p>
                      <p className="font-mono font-semibold">
                        {fairness.min !== null ? Number(fairness.min).toFixed(2) : "—"} /{" "}
                        {fairness.max !== null ? Number(fairness.max).toFixed(2) : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface-subtle p-2.5">
                      <p className="text-ink-subtle">Mean Balance</p>
                      <p className="font-mono font-semibold">
                        {fairness.mean !== null ? Number(fairness.mean).toFixed(2) : "—"}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : tab === "enrollments" ? (
        <EnrollmentsTab examId={examId} />
      ) : tab === "monitor" ? (
        <MonitorTab examId={examId} />
      ) : (
        <GradingAnalyticsTab examId={examId} />
      )}
    </AppShell>
  );
}

export default function ExaminerExamHubPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Spinner className="h-5 w-5 text-accent" />
        </div>
      }
    >
      <ExaminerExamHubInner />
    </Suspense>
  );
}
