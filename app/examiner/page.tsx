"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Activity,
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileDown,
  LogOut,
  Plus,
  Settings2,
  Users,
  XCircle,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { useAuth, roleHomePath } from "@/hooks/use-auth";
import {
  Button,
  Select,
  Spinner,
  ThemeToggleButton,
} from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import {
  computeClientLifecycle,
  examDurationMin,
  examEndAt,
  examResultsPublished,
  examTotalMarks,
} from "@/lib/client/api-types";

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, "MMM d, yyyy · hh:mm a");
}

export default function ExaminerDashboardPage() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [selectedExamId, setSelectedExamId] = useState<string>("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/examiner");
      return;
    }
    if (!user.active) {
      router.replace("/pending-approval");
      return;
    }
    if (!["ADMIN", "EXAMINER"].includes(user.role)) {
      router.replace(roleHomePath(user.role));
    }
  }, [user, loading, router]);

  const isAllowed = Boolean(user && user.active && ["ADMIN", "EXAMINER"].includes(user.role));

  const examsQuery = useQuery({
    queryKey: ["examiner-exams"],
    queryFn: () => api.exams.list(),
    enabled: isAllowed,
    refetchInterval: 30_000,
  });

  const overviewQuery = useQuery({
    queryKey: ["examiner-overview"],
    queryFn: () => api.examiner.overview(),
    enabled: isAllowed,
    refetchInterval: 30_000,
  });

  if (loading || !user || !isAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <Spinner className="h-5 w-5 text-accent" />
          Loading Examiner Portal…
        </div>
      </div>
    );
  }

  const allExams = examsQuery.data?.exams ?? [];
  const ongoingExams = allExams.filter((e) => computeClientLifecycle(e) === "ONGOING");
  const activeTargetExam =
    allExams.find((e) => e.id === selectedExamId) ?? ongoingExams[0] ?? allExams[0] ?? null;

  const stats = overviewQuery.data?.stats;
  const totalStudents = stats?.enrolledCandidates ?? 0;
  const avgPct = stats?.avgPerformancePct ?? 0;
  const passRate = stats?.passRatePct ?? 0;
  const failRate =
    stats?.passRatePct !== null && stats?.passRatePct !== undefined
      ? Number(Math.max(0, 100 - stats.passRatePct).toFixed(1))
      : 0;

  const chartData = (overviewQuery.data?.insightsSeries ?? []).map((pt) => {
    const hasActivity = pt.submitted > 0 || pt.passRate > 0 || pt.avgScorePct > 0;
    const ptFailRate = hasActivity ? Number(Math.max(0, 100 - pt.passRate).toFixed(1)) : 0;
    return {
      label: pt.label,
      avgScorePct: pt.avgScorePct,
      passRate: pt.passRate,
      failRate: ptFailRate,
    };
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
        {/* Minimal Top-Right Controls */}
        <div className="flex items-center justify-end gap-2.5">
          <ThemeToggleButton showLabel />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void signOut()}
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </div>

        {/* Hero Welcome Banner */}
        <section className="rounded-3xl border border-border bg-surface px-6 py-7 sm:px-9 sm:py-8 shadow-2xs">
          <div className="max-w-2xl">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Welcome! Examiner
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              Design fair blueprint exams, monitor live sessions transparently, and publish cryptographically verifiable results.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href="/examiner/exams/new"
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-accent-ink shadow-sm hover:bg-accent-hover transition-colors"
              >
                <Plus className="h-4 w-4" /> Create New Exam
              </Link>
              <Link
                href="/examiner/questions"
                className="inline-flex items-center gap-2 rounded-xl border border-border-strong bg-surface-subtle px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-surface-muted transition-colors"
              >
                <BookOpen className="h-4 w-4" /> Question Bank
              </Link>
            </div>
          </div>
        </section>

        {/* Middle 2-Column Row: Left = Manage & Enroll / Grading / Summary PDF | Right = Active & Live Exams */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Box (Replaces Examiner Toolkit with Screenshot 2 Controls) */}
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-2xs lg:col-span-5 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                <h2 className="text-base font-bold text-foreground">Exam Actions</h2>
                {allExams.length > 0 && (
                  <span className="text-xs text-ink-subtle">
                    {allExams.length} exam(s)
                  </span>
                )}
              </div>

              {allExams.length > 1 && (
                <div>
                  <label
                    htmlFor="examiner-action-exam"
                    className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-ink-subtle"
                  >
                    Select Exam
                  </label>
                  <Select
                    id="examiner-action-exam"
                    value={activeTargetExam?.id ?? ""}
                    onChange={(e) => setSelectedExamId(e.target.value)}
                    className="h-10 text-xs"
                  >
                    {allExams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.title}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {activeTargetExam ? (
                <div className="space-y-2.5">
                  <p className="truncate text-xs font-medium text-ink-muted">
                    Selected: <strong className="text-foreground">{activeTargetExam.title}</strong>
                  </p>
                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <Link href={`/examiner/exams/${activeTargetExam.id}`}>
                      <Button size="sm" variant="secondary">
                        <Settings2 className="h-4 w-4" /> Manage &amp; Enroll
                      </Button>
                    </Link>
                    <Link href={`/examiner/exams/${activeTargetExam.id}?tab=grading`}>
                      <Button size="sm" variant="secondary">
                        <BarChart3 className="h-4 w-4" /> Grading &amp; Analytics
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await api.reports.downloadExamPdf(
                            activeTargetExam.id,
                            activeTargetExam.title
                          );
                          toast.success("Exam summary PDF downloaded");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      <FileDown className="h-4 w-4" /> Summary PDF
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="py-6 text-sm text-ink-subtle">
                  Create your first exam above to manage enrollments, grade responses, and download summary PDFs.
                </p>
              )}
            </div>
          </section>

          {/* Right Box: Active & Live Exams */}
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-2xs lg:col-span-7">
            <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
              <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
                <Activity className="h-4.5 w-4.5 text-accent" />
                Active &amp; Live Exams
              </h2>
              <span className="text-xs font-semibold text-verified">
                {ongoingExams.length} Live
              </span>
            </div>

            {examsQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-subtle">
                <Spinner /> Loading live exams…
              </div>
            ) : ongoingExams.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-surface-subtle p-6 text-center text-sm text-ink-subtle">
                No exams are currently live. Create or publish an exam to begin live monitoring.
              </div>
            ) : (
              <div className="space-y-3">
                {ongoingExams.map((exam) => {
                  const published = examResultsPublished(exam);
                  return (
                    <div
                      key={exam.id}
                      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-subtle/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                          <ClipboardList className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/examiner/exams/${exam.id}`}
                              className="truncate text-sm font-bold text-foreground hover:text-accent"
                            >
                              {exam.title}
                            </Link>
                            <span className="inline-flex items-center gap-1 rounded-full bg-verified-soft px-2 py-0.5 text-[11px] font-semibold text-verified">
                              <span className="h-1.5 w-1.5 rounded-full bg-verified" />
                              Live Now
                            </span>
                            {published && (
                              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                                Results Published
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-ink-subtle">
                            {examTotalMarks(exam)} Marks ·{" "}
                            {exam.blueprint && exam.blueprint.length > 0
                              ? "Fair Blueprint Randomization"
                              : "Fixed Paper"}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-subtle">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              Closes {fmtDate(examEndAt(exam))}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {examDurationMin(exam)} min
                            </span>
                          </div>
                        </div>
                      </div>

                      <Link
                        href={`/examiner/exams/${exam.id}?tab=monitor`}
                        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-ink shadow-sm hover:bg-accent-hover transition-colors"
                      >
                        <Activity className="h-4 w-4" /> Live Monitor
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Bottom Box: Total Student Average & Pass/Fail Ratio Graph */}
        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-2xs">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Student Average &amp; Pass / Fail Ratio
              </h2>
              <p className="mt-0.5 text-xs text-ink-subtle">
                Overall student average score (%) alongside pass and fail rate trends
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-subtle px-3.5 py-2">
                <Users className="h-4 w-4 text-accent" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-subtle">
                    Total Students
                  </p>
                  <p className="text-sm font-bold text-foreground">
                    {overviewQuery.isLoading ? "…" : totalStudents}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-subtle px-3.5 py-2">
                <Award className="h-4 w-4 text-accent" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-subtle">
                    Student Average
                  </p>
                  <p className="text-sm font-bold text-foreground">
                    {overviewQuery.isLoading ? "…" : `${avgPct}%`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-subtle px-3.5 py-2">
                <CheckCircle2 className="h-4 w-4 text-verified" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-subtle">
                    Pass Rate
                  </p>
                  <p className="text-sm font-bold text-verified">
                    {overviewQuery.isLoading ? "…" : `${passRate}%`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-subtle px-3.5 py-2">
                <XCircle className="h-4 w-4 text-danger" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-subtle">
                    Fail Rate
                  </p>
                  <p className="text-sm font-bold text-danger">
                    {overviewQuery.isLoading ? "…" : `${failRate}%`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--ink-subtle)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  unit="%"
                  tick={{ fontSize: 11, fill: "var(--ink-subtle)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    borderColor: "var(--border)",
                    backgroundColor: "var(--surface)",
                    color: "var(--foreground)",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                <Bar
                  dataKey="passRate"
                  name="Pass Rate (%)"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  barSize={18}
                />
                <Bar
                  dataKey="failRate"
                  name="Fail Rate (%)"
                  fill="#dc2626"
                  radius={[4, 4, 0, 0]}
                  barSize={18}
                />
                <Line
                  type="monotone"
                  dataKey="avgScorePct"
                  name="Student Average (%)"
                  stroke="#113b32"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
