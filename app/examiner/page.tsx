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
  Home,
  LogOut,
  Menu,
  Plus,
  Scale,
  Settings2,
  ShieldCheck,
  Users,
  X,
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

function initialsOf(name?: string) {
  if (!name) return "EX";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase() || "EX";
}

export default function ExaminerDashboardPage() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      <div className="flex min-h-screen items-center justify-center bg-[#f5f6f5]">
        <div className="flex items-center gap-3 text-sm text-[#5f6b68]">
          <Spinner className="h-5 w-5 text-[#1b4d3e]" />
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

  async function handleSignOut() {
    await signOut();
    router.replace("/login?role=examiner");
  }

  return (
    <div className="flex min-h-screen bg-[#f5f6f5] text-[#15201d]">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#0b2922]/60 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Deep Forest Green Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col bg-[#113b32] text-[#f5f8f6] transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#22a06b] to-[#168a57] text-white shadow-md">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base font-bold leading-tight text-white">Exam Portal</p>
              <p className="text-xs text-[#a8d5c2]">Examiner Panel</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-1 text-[#a8d5c2] hover:bg-white/10 lg:hidden cursor-pointer"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="mt-2 flex-1 space-y-1 px-3">
          <Link
            href="/examiner"
            onClick={() => setMobileMenuOpen(false)}
            className="flex w-full items-center gap-3 rounded-xl bg-[#215347] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm"
          >
            <Home className="h-4.5 w-4.5 text-[#6ee7b7]" />
            <span>Dashboard</span>
          </Link>

          <Link
            href="/examiner/exams/new"
            onClick={() => setMobileMenuOpen(false)}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#d2e7de] transition hover:bg-[#1a4a3f] hover:text-white"
          >
            <Plus className="h-4.5 w-4.5 text-[#8ccbb0]" />
            <span>Create Exam</span>
          </Link>

          <Link
            href="/examiner/questions"
            onClick={() => setMobileMenuOpen(false)}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#d2e7de] transition hover:bg-[#1a4a3f] hover:text-white"
          >
            <BookOpen className="h-4.5 w-4.5 text-[#8ccbb0]" />
            <span>Question Bank</span>
          </Link>

          {activeTargetExam && (
            <>
              <Link
                href={`/examiner/exams/${activeTargetExam.id}?tab=monitor`}
                onClick={() => setMobileMenuOpen(false)}
                className="flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#d2e7de] transition hover:bg-[#1a4a3f] hover:text-white"
              >
                <span className="flex items-center gap-3">
                  <Activity className="h-4.5 w-4.5 text-[#8ccbb0]" />
                  <span>Live Monitor</span>
                </span>
                {ongoingExams.length > 0 && (
                  <span className="rounded-full bg-[#1e8e5a] px-2 py-0.5 text-[10px] font-bold text-white">
                    {ongoingExams.length}
                  </span>
                )}
              </Link>

              <Link
                href={`/examiner/exams/${activeTargetExam.id}?tab=grading`}
                onClick={() => setMobileMenuOpen(false)}
                className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#d2e7de] transition hover:bg-[#1a4a3f] hover:text-white"
              >
                <BarChart3 className="h-4.5 w-4.5 text-[#8ccbb0]" />
                <span>Grading &amp; Analytics</span>
              </Link>
            </>
          )}

          <Link
            href="/disputes"
            onClick={() => setMobileMenuOpen(false)}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#d2e7de] transition hover:bg-[#1a4a3f] hover:text-white"
          >
            <Scale className="h-4.5 w-4.5 text-[#8ccbb0]" />
            <span>Disputes</span>
          </Link>

          <Link
            href="/verify"
            onClick={() => setMobileMenuOpen(false)}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#d2e7de] transition hover:bg-[#1a4a3f] hover:text-white"
          >
            <ShieldCheck className="h-4.5 w-4.5 text-[#8ccbb0]" />
            <span>Public Verify</span>
          </Link>

          {user.role === "ADMIN" && (
            <Link
              href="/admin"
              onClick={() => setMobileMenuOpen(false)}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#6ee7b7] transition hover:bg-[#1a4a3f]"
            >
              <Settings2 className="h-4.5 w-4.5" />
              <span>Admin Panel</span>
            </Link>
          )}
        </nav>

        {/* Bottom Status + Sign Out */}
        <div className="space-y-2.5 p-4">
          <div className="rounded-xl border border-white/10 bg-[#1a4a3f] p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#6ee7b7]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
              <span>System Operational</span>
            </div>
            <p className="mt-1 text-[11px] text-[#b9dfd0]">
              {ongoingExams.length} live exam(s) · {allExams.length} total
            </p>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-[#1a4a3f] px-3.5 py-2.5 text-sm font-medium text-[#d2e7de] transition hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <LogOut className="h-4 w-4 text-[#8ccbb0]" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Right Main Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-[#e4e7e6] bg-white px-4 sm:px-7">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-[#113b32] hover:bg-[#e6f1ec] lg:hidden cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <p className="text-sm font-semibold text-[#113b32]">Examiner Control Center</p>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggleButton showLabel />
            <div className="flex items-center gap-2.5 rounded-full border border-[#d6e6de] bg-[#f4f9f6] py-1 pl-1 pr-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1b4d3e] text-xs font-bold text-white">
                {initialsOf(user.name)}
              </span>
              <span className="hidden text-xs font-semibold text-[#15201d] sm:inline">
                {user.name}
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-7 sm:py-7 space-y-6">
          {/* Rich Forest Green Hero Welcome Banner */}
          <section className="relative overflow-hidden rounded-3xl border border-[#14533e] bg-gradient-to-r from-[#113b32] via-[#165542] to-[#1c6d52] px-6 py-7 text-white shadow-md sm:px-9 sm:py-8">
            <div className="relative z-10 max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-[#a7f3d0]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" />
                Examiner Workspace
              </span>
              <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Welcome! Examiner
              </h1>
              <p className="mt-2 text-sm text-[#d1ece0]">
                Design fair blueprint exams, monitor live sessions transparently, and publish cryptographically verifiable results.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link
                  href="/examiner/exams/new"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-[#113b32] shadow-sm transition hover:bg-[#e6f1ec]"
                >
                  <Plus className="h-4 w-4" /> Create New Exam
                </Link>
                <Link
                  href="/examiner/questions"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/20"
                >
                  <BookOpen className="h-4 w-4" /> Question Bank
                </Link>
              </div>
            </div>

            <div className="pointer-events-none absolute -right-6 -bottom-6 hidden opacity-15 md:block">
              <ShieldCheck className="h-44 w-44 text-[#a7f3d0]" />
            </div>
          </section>

          {/* Middle 2-Column Row: Exam Actions | Active & Live Exams */}
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left Box: Exam Actions */}
            <section className="flex flex-col justify-between space-y-5 rounded-2xl border border-[#dce7e1] bg-white p-5 shadow-2xs lg:col-span-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-[#e4e7e6] pb-3">
                  <h2 className="text-base font-bold text-[#15201d]">Exam Actions</h2>
                  {allExams.length > 0 && (
                    <span className="rounded-full bg-[#e6f1ec] px-2.5 py-0.5 text-xs font-semibold text-[#1b4d3e]">
                      {allExams.length} exam(s)
                    </span>
                  )}
                </div>

                {allExams.length > 1 && (
                  <div>
                    <label
                      htmlFor="examiner-action-exam"
                      className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#5f6b68]"
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
                    <p className="truncate text-xs font-medium text-[#5f6b68]">
                      Selected: <strong className="text-[#15201d]">{activeTargetExam.title}</strong>
                    </p>
                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <Link href={`/examiner/exams/${activeTargetExam.id}`}>
                        <Button size="sm" variant="primary">
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
                        <FileDown className="h-4 w-4 text-[#1b4d3e]" /> Summary PDF
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="py-6 text-sm text-[#5f6b68]">
                    Create your first exam above to manage enrollments, grade responses, and download summary PDFs.
                  </p>
                )}
              </div>
            </section>

            {/* Right Box: Active & Live Exams */}
            <section className="rounded-2xl border border-[#dce7e1] bg-white p-5 shadow-2xs lg:col-span-7">
              <div className="mb-4 flex items-center justify-between border-b border-[#e4e7e6] pb-3">
                <h2 className="flex items-center gap-2 text-base font-bold text-[#15201d]">
                  <Activity className="h-4.5 w-4.5 text-[#1b4d3e]" />
                  Active &amp; Live Exams
                </h2>
                <span className="rounded-full bg-[#e6f1ec] px-2.5 py-0.5 text-xs font-semibold text-[#1e8e5a]">
                  {ongoingExams.length} Live
                </span>
              </div>

              {examsQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#5f6b68]">
                  <Spinner /> Loading live exams…
                </div>
              ) : ongoingExams.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#c7dfd4] bg-[#f4f9f6] p-6 text-center text-sm text-[#5f6b68]">
                  No exams are currently live. Create or publish an exam to begin live monitoring.
                </div>
              ) : (
                <div className="space-y-3">
                  {ongoingExams.map((exam) => {
                    const published = examResultsPublished(exam);
                    return (
                      <div
                        key={exam.id}
                        className="flex flex-col gap-3 rounded-2xl border border-[#dcebe4] bg-[#f4f9f6] p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-start gap-3.5">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e6f1ec] text-[#1b4d3e]">
                            <ClipboardList className="h-6 w-6" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/examiner/exams/${exam.id}`}
                                className="truncate text-sm font-bold text-[#15201d] hover:text-[#1b4d3e]"
                              >
                                {exam.title}
                              </Link>
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#e6f1ec] px-2 py-0.5 text-[11px] font-semibold text-[#1e8e5a]">
                                <span className="h-1.5 w-1.5 rounded-full bg-[#1e8e5a]" />
                                Live Now
                              </span>
                              {published && (
                                <span className="rounded-full bg-[#d1e7dd] px-2 py-0.5 text-[11px] font-semibold text-[#113b32]">
                                  Results Published
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-[#5f6b68]">
                              {examTotalMarks(exam)} Marks ·{" "}
                              {exam.blueprint && exam.blueprint.length > 0
                                ? "Fair Blueprint Randomization"
                                : "Fixed Paper"}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-[#5f6b68]">
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5 text-[#1b4d3e]" />
                                Closes {fmtDate(examEndAt(exam))}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-[#1b4d3e]" />
                                {examDurationMin(exam)} min
                              </span>
                            </div>
                          </div>
                        </div>

                        <Link
                          href={`/examiner/exams/${exam.id}?tab=monitor`}
                          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#1b4d3e] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#143b30]"
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
          <section className="rounded-2xl border border-[#dce7e1] bg-white p-5 shadow-2xs sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-[#15201d]">
                  Student Average &amp; Pass / Fail Ratio
                </h2>
                <p className="mt-0.5 text-xs text-[#5f6b68]">
                  Overall student average score (%) alongside pass and fail rate trends
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-xl border border-[#dcebe4] bg-[#f4f9f6] px-3.5 py-2">
                  <Users className="h-4 w-4 text-[#1b4d3e]" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[#5f6b68]">
                      Total Students
                    </p>
                    <p className="text-sm font-bold text-[#15201d]">
                      {overviewQuery.isLoading ? "…" : totalStudents}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-[#dcebe4] bg-[#f4f9f6] px-3.5 py-2">
                  <Award className="h-4 w-4 text-[#1b4d3e]" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[#5f6b68]">
                      Student Average
                    </p>
                    <p className="text-sm font-bold text-[#15201d]">
                      {overviewQuery.isLoading ? "…" : `${avgPct}%`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-[#c7e6d6] bg-[#e6f1ec] px-3.5 py-2">
                  <CheckCircle2 className="h-4 w-4 text-[#1e8e5a]" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[#14533e]">
                      Pass Rate
                    </p>
                    <p className="text-sm font-bold text-[#1e8e5a]">
                      {overviewQuery.isLoading ? "…" : `${passRate}%`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2">
                  <XCircle className="h-4 w-4 text-rose-600" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-rose-700">
                      Fail Rate
                    </p>
                    <p className="text-sm font-bold text-rose-600">
                      {overviewQuery.isLoading ? "…" : `${failRate}%`}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e7e6" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#5f6b68" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    unit="%"
                    tick={{ fontSize: 11, fill: "#5f6b68" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "10px",
                      borderColor: "#dce7e1",
                      backgroundColor: "#ffffff",
                      color: "#15201d",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                  <Bar
                    dataKey="passRate"
                    name="Pass Rate (%)"
                    fill="#1e8e5a"
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
                    dot={{ r: 3, fill: "#ffffff", stroke: "#113b32", strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
