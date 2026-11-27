"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Eye,
  FileDown,
  FlaskConical,
  KeyRound,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { EnrollmentsTab } from "@/components/examiner/enrollments-tab";
import { ExaminerShell } from "@/components/examiner/examiner-shell";
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
  type ExaminerIntegrityReport,
} from "@/lib/client/api-types";

type TabId = "overview" | "enrollments" | "monitor" | "grading";

function ExaminerExamHubInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();

  const examId = params.id;
  const initialTab = (searchParams.get("tab") as TabId) || "overview";
  const [tab, setTab] = useState<TabId>(
    ["overview", "enrollments", "monitor", "grading"].includes(initialTab)
      ? initialTab
      : "overview"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [integrityReport, setIntegrityReport] =
    useState<ExaminerIntegrityReport | null>(null);

  const isAuthorized = Boolean(
    user && (user.role === "EXAMINER" || user.role === "ADMIN")
  );

  const overviewQuery = useQuery({
    queryKey: ["examiner-overview", 30, examId],
    queryFn: () => api.examiner.overview({ days: 30, examId }),
    enabled: isAuthorized,
    refetchInterval: 30_000,
  });

  const detailQuery = useQuery({
    queryKey: ["exam-detail", examId],
    queryFn: () => api.exams.get(examId),
    enabled: Boolean(examId) && isAuthorized,
  });

  const fairnessQuery = useQuery({
    queryKey: ["exam-fairness", examId],
    queryFn: () => api.exams.fairness(examId),
    enabled: Boolean(examId) && tab === "overview" && isAuthorized,
  });

  const updateExamMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.exams.update(examId, body),
    onSuccess: () => {
      toast.success("Exam updated");
      qc.invalidateQueries({ queryKey: ["exam-detail", examId] });
      qc.invalidateQueries({ queryKey: ["exam-fairness", examId] });
      qc.invalidateQueries({ queryKey: ["examiner-exams"] });
      qc.invalidateQueries({ queryKey: ["examiner-overview"] });
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

  const integrityMut = useMutation({
    mutationFn: () => api.examiner.integrityCheck(examId),
    onSuccess: (res) => {
      setIntegrityReport(res);
      if (res.allValid) {
        toast.success(
          `Verified ${res.attemptsChecked} attempt(s) & ${res.answersChecked} chained answers intact`
        );
      } else {
        toast.error(`Tampering detected in ${res.tamperedAttempts.length} record(s)`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const exam = detailQuery.data?.exam;
  const questions = detailQuery.data?.questions ?? [];
  const fairness = fairnessQuery.data ?? detailQuery.data?.fairnessReport;
  const lifecycle = exam ? computeClientLifecycle(exam) : "DRAFT";
  const resultsPublished = exam ? examResultsPublished(exam) : false;

  return (
    <ExaminerShell
      activeTab="exams"
      onSelectTab={(selectedTab) => {
        if (selectedTab === "dashboard") {
          router.push("/examiner");
        } else {
          router.push(`/examiner?tab=${encodeURIComponent(selectedTab)}`);
        }
      }}
      overview={overviewQuery.data}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onSelectExamForMonitor={(id) =>
        router.push(`/examiner?tab=monitor&examId=${encodeURIComponent(id)}`)
      }
      onSelectExamForResults={(id) =>
        router.push(`/examiner?tab=results&examId=${encodeURIComponent(id)}`)
      }
      onVerifyIntegrity={() => integrityMut.mutate()}
      isVerifyingIntegrity={integrityMut.isPending}
      integrityReport={integrityReport}
      onDismissIntegrityReport={() => setIntegrityReport(null)}
    >
      <div className="mx-auto max-w-6xl space-y-5">
        {/* Breadcrumb & Header Actions */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/examiner?tab=exams"
              className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to My Exams
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {exam?.title ?? "Exam Management"}
            </h1>
            <p className="mt-1 text-sm text-ink-subtle">
              {exam
                ? `${lifecycle} · ${examDurationMin(exam)} min · ${examTotalMarks(exam)} marks · ${detailQuery.data?.enrollmentCount ?? 0} enrolled`
                : "Loading exam configuration…"}
            </p>
          </div>

          {exam && (
            <div className="flex flex-wrap items-center gap-2">
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
            </div>
          )}
        </div>

        {/* Sub-Tabs */}
        <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
          {(
            [
              { id: "overview", label: "Overview & Fairness", icon: <Eye className="h-4 w-4" /> },
              {
                id: "enrollments",
                label: "Enrollments & CSV",
                icon: <Users className="h-4 w-4" />,
              },
              {
                id: "monitor",
                label: "Live Monitor & Alerts",
                icon: <Activity className="h-4 w-4" />,
              },
              {
                id: "grading",
                label: "Grading & Analytics",
                icon: <BarChart3 className="h-4 w-4" />,
              },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-accent text-accent-ink shadow-xs"
                  : "border border-border bg-surface text-ink-muted hover:bg-surface-subtle hover:text-foreground"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {detailQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-subtle">
            <Spinner /> Loading exam hub…
          </div>
        ) : detailQuery.error || !exam ? (
          <Card>
            <CardContent className="text-sm text-rose-600">
              {(detailQuery.error as Error)?.message ?? "Exam not found"}
            </CardContent>
          </Card>
        ) : tab === "overview" ? (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <Card className="rounded-2xl border-border shadow-2xs">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-foreground">
                      Lifecycle &amp; Result Controls
                    </h3>
                    <Badge tone={lifecycle === "ONGOING" ? "verified" : "accent"}>
                      {lifecycle}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div className="rounded-xl border border-border bg-surface-subtle p-3">
                      <p className="text-xs font-semibold uppercase text-slate-400">Opens</p>
                      <p className="mt-0.5 font-medium text-foreground">
                        {new Date(examStartAt(exam)).toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-surface-subtle p-3">
                      <p className="text-xs font-semibold uppercase text-slate-400">Closes</p>
                      <p className="mt-0.5 font-medium text-foreground">
                        {new Date(examEndAt(exam)).toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-surface-subtle p-3">
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        Duration / Grace
                      </p>
                      <p className="mt-0.5 font-medium text-foreground">
                        {examDurationMin(exam)} min (+{examGraceSec(exam)}s sync grace)
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-surface-subtle p-3">
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        Attached Pool
                      </p>
                      <p className="mt-0.5 font-medium text-foreground">
                        {questions.length} question(s) · {examTotalMarks(exam)} marks
                      </p>
                    </div>
                  </div>

                  {exam.instructions && (
                    <div className="rounded-xl border border-border bg-surface-subtle p-3.5 text-sm text-ink-muted">
                      <p className="mb-1 text-xs font-semibold uppercase text-slate-400">
                        Instructions
                      </p>
                      {exam.instructions}
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
                      disabled={
                        updateExamMut.isPending ||
                        Boolean(exam.seed_reveal ?? exam.seedReveal)
                      }
                      onClick={() => updateExamMut.mutate({ revealSeed: true })}
                    >
                      <KeyRound className="h-4 w-4" />
                      {exam.seed_reveal ?? exam.seedReveal
                        ? "Seed Revealed"
                        : "Reveal Audit Seed"}
                    </Button>

                    <Link href={`/verify?examId=${encodeURIComponent(exam.id)}`}>
                      <Button variant="ghost" size="sm">
                        <ShieldCheck className="h-4 w-4 text-emerald-600" /> Public Exam Audit
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Attached Questions Preview */}
              <Card className="rounded-2xl border-border shadow-2xs">
                <CardHeader>
                  <h3 className="text-base font-bold text-foreground">
                    Exam Questions ({questions.length})
                  </h3>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {questions.length === 0 ? (
                    <p className="text-sm text-ink-subtle">
                      No fixed questions attached (using blueprint or pending question selection).
                    </p>
                  ) : (
                    questions.map((q, i) => (
                      <div
                        key={q.id || i}
                        className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface-subtle p-3 text-sm"
                      >
                        <div>
                          <span className="mr-2 font-mono text-xs font-semibold text-accent">
                            Q{i + 1}
                          </span>
                          <span className="font-medium text-foreground">{q.text}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
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
              <Card className="rounded-2xl border-border shadow-2xs">
                <CardHeader>
                  <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" /> Fairness &amp; Seed Audit
                  </h3>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div>
                    <p className="font-semibold uppercase text-slate-400">
                      Seed Commitment (SHA-256)
                    </p>
                    <p className="mt-1 break-all rounded-lg border border-border bg-surface-subtle p-2 font-mono text-[11px] text-ink-muted">
                      {fairness?.seedCommitment ??
                        exam.seed_commitment ??
                        exam.seedCommitment ??
                        "—"}
                    </p>
                  </div>

                  {(fairness?.seedRevealed ??
                    fairness?.seedReveal ??
                    exam.seed_reveal ??
                    exam.seedReveal) && (
                    <div>
                      <p className="font-semibold uppercase text-emerald-600">Revealed Seed</p>
                      <p className="mt-1 break-all rounded-lg border border-emerald-200 bg-emerald-50 p-2 font-mono text-[11px] text-emerald-800">
                        {fairness?.seedRevealed ??
                          fairness?.seedReveal ??
                          exam.seed_reveal ??
                          exam.seedReveal}
                      </p>
                    </div>
                  )}

                  {fairness && (
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div className="col-span-2 rounded-xl border border-border bg-surface-subtle p-2.5">
                        <p className="text-ink-subtle">Fairness Verdict (Challenge 5.2)</p>
                        <p
                          className={`text-sm font-bold ${
                            fairness.verdict === "FAIR_AND_VARIED"
                              ? "text-verified"
                              : fairness.verdict === "UNEQUAL_DIFFICULTY"
                                ? "text-danger"
                                : "text-warning"
                          }`}
                        >
                          {fairness.verdict === "FAIR_AND_VARIED"
                            ? "Equal difficulty · papers still vary"
                            : fairness.verdict === "FAIR_LOW_VARIATION"
                              ? "Equal difficulty · low variation (attach a bigger question pool)"
                              : fairness.verdict === "UNEQUAL_DIFFICULTY"
                                ? "Papers differ in difficulty — review blueprint & pool"
                                : "No papers generated yet"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border bg-surface-subtle p-2.5">
                        <p className="text-ink-subtle">Papers Audited</p>
                        <p className="text-base font-bold font-mono text-foreground">
                          {fairness.attemptsCount}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border bg-surface-subtle p-2.5">
                        <p className="text-ink-subtle">Difficulty Spread</p>
                        <p className="text-base font-bold font-mono text-foreground">
                          {fairness.spread !== null && fairness.spread !== undefined
                            ? Number(fairness.spread).toFixed(3)
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border bg-surface-subtle p-2.5">
                        <p className="text-ink-subtle">Blueprint Match</p>
                        <p className="font-mono font-semibold text-foreground">
                          {fairness.hasBlueprint
                            ? fairness.blueprintCompliancePct !== null &&
                              fairness.blueprintCompliancePct !== undefined
                              ? `${fairness.blueprintCompliancePct}%`
                              : "—"
                            : "No blueprint"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border bg-surface-subtle p-2.5">
                        <p className="text-ink-subtle">Paper Variation</p>
                        <p className="font-mono font-semibold text-foreground">
                          {fairness.variationPct !== null && fairness.variationPct !== undefined
                            ? `${fairness.variationPct}%`
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border bg-surface-subtle p-2.5">
                        <p className="text-ink-subtle">Unique Papers / Pool</p>
                        <p className="font-mono font-semibold text-foreground">
                          {fairness.uniquePapers ?? 0} / {fairness.poolSize ?? 0} Qs
                        </p>
                      </div>
                      <div className="rounded-xl border border-border bg-surface-subtle p-2.5">
                        <p className="text-ink-subtle">Min / Max Balance</p>
                        <p className="font-mono font-semibold text-foreground">
                          {fairness.min !== null ? Number(fairness.min).toFixed(2) : "—"} /{" "}
                          {fairness.max !== null ? Number(fairness.max).toFixed(2) : "—"}
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
      </div>
    </ExaminerShell>
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
