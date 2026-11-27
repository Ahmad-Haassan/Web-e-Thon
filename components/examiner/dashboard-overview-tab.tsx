"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Calculator,
  Calendar,
  Check,
  ClipboardCheck,
  Clock,
  FileDown,
  FileText,
  FlaskConical,
  Globe,
  Laptop,
  MoreVertical,
  PieChart as PieChartIcon,
  Play,
  Plus,
  PlusCircle,
  Radio,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  Wrench,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Badge, Button, Input, Spinner } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import type {
  ExaminerExamSummary,
  ExaminerOverviewResponse,
} from "@/lib/client/api-types";
import { EXAM_TEMPLATES, type ExamTemplate, type ExaminerTab } from "./examiner-types";

interface DashboardOverviewTabProps {
  userName: string;
  overview?: ExaminerOverviewResponse;
  isLoading: boolean;
  error?: Error | null;
  days: 7 | 30;
  onChangeDays: (days: 7 | 30) => void;
  focusExamId?: string;
  onChangeFocusExamId: (examId: string) => void;
  onNavigateTab: (tab: ExaminerTab) => void;
  onCreateNew: () => void;
  onUseTemplate: (template: ExamTemplate) => void;
  onEditExam: (examId: string) => void;
  onMonitorExam: (examId: string) => void;
  onOpenResults: (examId: string) => void;
  onVerifyIntegrity: (examId?: string) => void;
}

function getExamTileVisual(exam: ExaminerExamSummary, idx: number) {
  const t = exam.title.toLowerCase();
  if (t.includes("calc") || t.includes("math") || t.includes("stat")) {
    return { Icon: Calculator, bg: "bg-indigo-100 text-accent" };
  }
  if (t.includes("web") || t.includes("net") || t.includes("cloud")) {
    return { Icon: Globe, bg: "bg-sky-100 text-sky-600" };
  }
  if (t.includes("data") || t.includes("algo") || t.includes("cs-") || idx === 0) {
    return { Icon: Laptop, bg: "bg-blue-100 text-accent" };
  }
  return { Icon: BookOpen, bg: "bg-violet-100 text-violet-600" };
}

function getLifecyclePill(lifecycle: ExaminerExamSummary["lifecycle"]) {
  switch (lifecycle) {
    case "ONGOING":
      return { label: "Ongoing", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" };
    case "PUBLISHED":
      return { label: "Scheduled", cls: "bg-accent-soft text-accent border-border-strong", dot: "bg-accent" };
    case "COMPLETED":
      return { label: "Completed", cls: "bg-accent-soft text-accent border-border-strong", dot: "bg-accent" };
    default:
      return { label: "Draft", cls: "bg-surface-muted text-ink-muted border-border", dot: "bg-slate-400" };
  }
}

export function DashboardOverviewTab({
  userName,
  overview,
  isLoading,
  error,
  days,
  onChangeDays,
  focusExamId,
  onChangeFocusExamId,
  onNavigateTab,
  onCreateNew,
  onUseTemplate,
  onEditExam,
  onMonitorExam,
  onOpenResults,
  onVerifyIntegrity,
}: DashboardOverviewTabProps) {
  const router = useRouter();
  const qc = useQueryClient();

  const [nowDisplay, setNowDisplay] = useState(() => new Date());
  const [openMenuExamId, setOpenMenuExamId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Live announcement inline composer
  const [showAnnouncementBox, setShowAnnouncementBox] = useState(false);
  const [announcementText, setAnnouncementText] = useState("");

  // Modals: Templates & PDF Generator
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfExamId, setPdfExamId] = useState<string>("");

  useEffect(() => {
    const t = setInterval(() => setNowDisplay(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const exams = overview?.exams ?? [];
  const stats = overview?.stats;
  const live = overview?.liveMonitoring ?? null;
  const series = overview?.insightsSeries ?? [];

  const activePdfExamId = pdfExamId || exams[0]?.id || "";
  const pdfExamAnalyticsQuery = useQuery({
    queryKey: ["pdf-modal-analytics", activePdfExamId],
    queryFn: () => api.exams.analytics(activePdfExamId),
    enabled: showPdfModal && Boolean(activePdfExamId),
  });

  const announcementMut = useMutation({
    mutationFn: ({ examId, message }: { examId: string; message: string }) =>
      api.exams.postAnnouncement(examId, message),
    onSuccess: () => {
      toast.success("Announcement broadcast to all candidates");
      setAnnouncementText("");
      setShowAnnouncementBox(false);
      qc.invalidateQueries({ queryKey: ["examiner-overview"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const publishExamMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.exams.update(id, body),
    onSuccess: () => {
      toast.success("Examination updated");
      setOpenMenuExamId(null);
      qc.invalidateQueries({ queryKey: ["examiner-overview"] });
      qc.invalidateQueries({ queryKey: ["examiner-exams"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteExamMut = useMutation({
    mutationFn: (id: string) => api.exams.delete(id),
    onSuccess: () => {
      toast.success("Exam deleted");
      setConfirmDeleteId(null);
      setOpenMenuExamId(null);
      qc.invalidateQueries({ queryKey: ["examiner-overview"] });
      qc.invalidateQueries({ queryKey: ["examiner-exams"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sandboxMut = useMutation({
    mutationFn: (examId: string) =>
      api.attempts.start(examId, { isSandbox: true, integrityAck: true }),
    onSuccess: (res) => {
      toast.success("Sandbox preview started (excluded from exam metrics)");
      router.push(`/exam/${res.attempt.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleAnnouncementSubmit(e: FormEvent) {
    e.preventDefault();
    if (!live?.examId) {
      toast.error("Create an exam first before sending an announcement");
      return;
    }
    const msg = announcementText.trim();
    if (!msg) return;
    announcementMut.mutate({ examId: live.examId, message: msg });
  }

  // Donut chart data
  const inProgressCount = live?.inProgress ?? 0;
  const submittedCount = live?.submitted ?? 0;
  const notStartedCount = live?.notStarted ?? 0;
  const totalDonut = inProgressCount + submittedCount + notStartedCount;
  const hasDonutData = totalDonut > 0;

  const donutData = hasDonutData
    ? [
        { name: "In Progress", value: inProgressCount, color: "#16a34a" },
        { name: "Submitted", value: submittedCount, color: "#46351a" },
        { name: "Not Started", value: notStartedCount, color: "#cbd5e1" },
      ].filter((d) => d.value > 0)
    : [{ name: "No Activity", value: 1, color: "#e2e8f0" }];

  const centerPct = !hasDonutData
    ? 0
    : inProgressCount > 0
      ? live?.inProgressPct ?? 0
      : Math.round((submittedCount / totalDonut) * 100);
  const centerLabel =
    !hasDonutData
      ? "No Sessions"
      : inProgressCount > 0
        ? "In Progress"
        : "Submitted";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Welcome Row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome Back, {userName}!
          </h1>
          <p className="mt-1 text-sm text-ink-subtle">
            Manage your examinations and monitor active sessions
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-medium text-ink-muted shadow-2xs">
          <Calendar className="h-3.5 w-3.5 text-accent" />
          <span>{format(nowDisplay, "MMM dd, yyyy • hh:mm a")}</span>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error.message}
        </div>
      )}

      {/* 4 KPI Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* 1. Total Exams */}
        <button
          type="button"
          onClick={() => onNavigateTab("exams")}
          className="flex items-center gap-4 rounded-2xl border border-blue-100 bg-gradient-to-br from-[#edf4ff] to-[#f8faff] p-5 text-left shadow-2xs transition hover:shadow-md cursor-pointer"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-sm">
            <FileText className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {isLoading ? "…" : (stats?.totalExams ?? 0).toLocaleString()}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
              <span className="truncate">Total Exams</span>
              <span className="font-semibold text-emerald-600 shrink-0">
                ↑ {stats?.examsCreatedLast30Days ?? 0}
              </span>
            </p>
          </div>
        </button>

        {/* 2. Ongoing Exam */}
        <button
          type="button"
          onClick={() => onNavigateTab("monitor")}
          className="flex items-center gap-4 rounded-2xl border border-emerald-100 bg-gradient-to-br from-[#ecfdf5] to-[#f7fefb] p-5 text-left shadow-2xs transition hover:shadow-md cursor-pointer"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
            <Play className="h-5 w-5 fill-current" />
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {isLoading ? "…" : (stats?.ongoingExams ?? 0).toLocaleString()}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
              <span className="truncate">Ongoing Exam</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-surface/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Live
              </span>
            </p>
          </div>
        </button>

        {/* 3. Enrolled Candidates */}
        <button
          type="button"
          onClick={() => onNavigateTab("results")}
          className="flex items-center gap-4 rounded-2xl border border-violet-100 bg-gradient-to-br from-[#f3f0ff] to-[#faf9ff] p-5 text-left shadow-2xs transition hover:shadow-md cursor-pointer"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
            <Users className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {isLoading ? "…" : (stats?.enrolledCandidates ?? 0).toLocaleString()}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
              <span className="truncate">Enrolled Candidates</span>
              <span className="font-semibold text-emerald-600 shrink-0">
                {stats?.totalSubmitted ?? 0} done
              </span>
            </p>
          </div>
        </button>

        {/* 4. Avg Performance */}
        <button
          type="button"
          onClick={() => onNavigateTab("analytics")}
          className="flex items-center gap-4 rounded-2xl border border-amber-100 bg-gradient-to-br from-[#fff7ed] to-[#fffcf7] p-5 text-left shadow-2xs transition hover:shadow-md cursor-pointer"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
            <Check className="h-6 w-6 stroke-[2.5]" />
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {isLoading
                ? "…"
                : stats?.avgPerformancePct !== null && stats?.avgPerformancePct !== undefined
                  ? `${stats.avgPerformancePct}%`
                  : "—"}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
              <span className="truncate">Avg Performance</span>
              <span className="font-semibold text-emerald-600 shrink-0">
                {stats?.passRatePct !== null && stats?.passRatePct !== undefined
                  ? `${stats.passRatePct}% pass`
                  : "0 graded"}
              </span>
            </p>
          </div>
        </button>
      </div>

      {/* Middle Row: My Exams + Live Monitoring */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* My Exams */}
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs lg:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">My Exams</h2>
            <button
              type="button"
              onClick={() => onNavigateTab("exams")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent cursor-pointer"
            >
              View All <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-subtle">
              <Spinner /> Loading examinations…
            </div>
          ) : exams.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface-subtle p-8 text-center">
              <p className="text-sm font-semibold text-foreground">No examinations created yet</p>
              <p className="mt-1 text-xs text-ink-subtle">
                Create a new exam or pick a preset template below to get started.
              </p>
              <Button size="sm" className="mt-4" onClick={onCreateNew}>
                <Plus className="h-3.5 w-3.5" /> Create First Exam
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {exams.slice(0, 3).map((exam, idx) => {
                const { Icon, bg } = getExamTileVisual(exam, idx);
                const pill = getLifecyclePill(exam.lifecycle);
                const menuOpen = openMenuExamId === exam.id;

                return (
                  <div
                    key={exam.id}
                    className="relative flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-[#f9fbff] p-3.5 transition hover:border-blue-100"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3.5">
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${bg}`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={`/examiner/exams/${exam.id}`}
                          className="block truncate text-sm font-bold text-foreground hover:text-accent"
                        >
                          {exam.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-subtle">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(exam.startAt), "MMM d, yyyy · hh:mm a")}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {exam.durationMin} min · {exam.totalMarks} marks
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${pill.cls}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${pill.dot}`} />
                        {pill.label}
                      </span>

                      {exam.lifecycle === "ONGOING" ? (
                        <button
                          type="button"
                          onClick={() => onMonitorExam(exam.id)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1e3a8a] px-3 text-xs font-semibold text-white transition hover:bg-[#1e40af] cursor-pointer"
                        >
                          <BarChart3 className="h-3.5 w-3.5" /> Monitor
                        </button>
                      ) : exam.lifecycle === "PUBLISHED" ? (
                        <Link
                          href={`/examiner/exams/${exam.id}`}
                          className="inline-flex h-8 items-center rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-ink-muted transition hover:bg-surface-subtle"
                        >
                          Manage
                        </Link>
                      ) : exam.lifecycle === "DRAFT" ? (
                        <button
                          type="button"
                          onClick={() => onEditExam(exam.id)}
                          className="inline-flex h-8 items-center rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-ink-muted transition hover:bg-surface-subtle cursor-pointer"
                        >
                          Edit
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenResults(exam.id)}
                          className="inline-flex h-8 items-center rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-ink-muted transition hover:bg-surface-subtle cursor-pointer"
                        >
                          Results
                        </button>
                      )}

                      <div className="relative">
                        <button
                          type="button"
                          aria-label={`More actions for ${exam.title}`}
                          onClick={() => setOpenMenuExamId(menuOpen ? null : exam.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle hover:bg-slate-200/60 cursor-pointer"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {menuOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-30"
                              onClick={() => setOpenMenuExamId(null)}
                            />
                            <div className="absolute right-0 z-40 mt-1 w-52 rounded-xl border border-border bg-surface p-1.5 shadow-xl text-xs">
                              <Link
                                href={`/examiner/exams/${exam.id}`}
                                onClick={() => setOpenMenuExamId(null)}
                                className="flex items-center gap-2 rounded-lg px-2.5 py-2 font-medium text-ink-muted hover:bg-surface-subtle"
                              >
                                <ClipboardCheck className="h-3.5 w-3.5 text-accent" /> Manage Exam Hub
                              </Link>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuExamId(null);
                                  onEditExam(exam.id);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-ink-muted hover:bg-surface-subtle cursor-pointer"
                              >
                                <FileText className="h-3.5 w-3.5 text-ink-subtle" /> Edit Exam Details
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuExamId(null);
                                  onMonitorExam(exam.id);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-ink-muted hover:bg-surface-subtle cursor-pointer"
                              >
                                <Radio className="h-3.5 w-3.5 text-emerald-600" /> Live Monitor
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuExamId(null);
                                  onOpenResults(exam.id);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-ink-muted hover:bg-surface-subtle cursor-pointer"
                              >
                                <BarChart3 className="h-3.5 w-3.5 text-accent" /> Results &amp; Grading
                              </button>
                              {exam.status === "DRAFT" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    publishExamMut.mutate({
                                      id: exam.id,
                                      body: { status: "PUBLISHED" },
                                    })
                                  }
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                                >
                                  <Send className="h-3.5 w-3.5" /> Publish Exam
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  publishExamMut.mutate({
                                    id: exam.id,
                                    body: { resultsPublished: !exam.resultsPublished },
                                  })
                                }
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-ink-muted hover:bg-surface-subtle cursor-pointer"
                              >
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                                {exam.resultsPublished ? "Unpublish Results" : "Publish Results"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuExamId(null);
                                  sandboxMut.mutate(exam.id);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-ink-muted hover:bg-surface-subtle cursor-pointer"
                              >
                                <FlaskConical className="h-3.5 w-3.5 text-violet-600" /> Sandbox Preview
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  setOpenMenuExamId(null);
                                  try {
                                    await api.reports.downloadExamPdf(exam.id, exam.title);
                                    toast.success("Summary PDF downloaded");
                                  } catch (e) {
                                    toast.error((e as Error).message);
                                  }
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-ink-muted hover:bg-surface-subtle cursor-pointer"
                              >
                                <FileDown className="h-3.5 w-3.5 text-rose-600" /> Download PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuExamId(null);
                                  onVerifyIntegrity(exam.id);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-ink-muted hover:bg-surface-subtle cursor-pointer"
                              >
                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Verify Integrity
                              </button>
                              <div className="my-1 border-t border-border" />
                              {confirmDeleteId === exam.id ? (
                                <div className="flex items-center justify-between gap-1 px-2 py-1">
                                  <button
                                    type="button"
                                    onClick={() => deleteExamMut.mutate(exam.id)}
                                    className="rounded bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 cursor-pointer"
                                  >
                                    Confirm Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="rounded px-2 py-1 text-[11px] text-ink-subtle hover:bg-surface-muted cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(exam.id)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-rose-600 hover:bg-rose-50 cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Delete Exam
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Live Monitoring */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-2xs lg:col-span-5">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
                <Radio className="h-4.5 w-4.5 text-accent" />
                Live Monitoring
              </h2>

              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  inProgressCount > 0
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-surface-muted text-ink-muted"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    inProgressCount > 0 ? "bg-emerald-500" : "bg-slate-400"
                  }`}
                />
                {inProgressCount > 0
                  ? `Active · ${inProgressCount} Student${inProgressCount === 1 ? "" : "s"}`
                  : "Standby · 0 Active"}
              </span>
            </div>

            {/* Optional Exam Switcher when multiple exams exist */}
            {exams.length > 0 && (
              <div className="mt-2.5">
                <select
                  aria-label="Live monitoring exam"
                  value={focusExamId || live?.examId || exams[0]?.id || ""}
                  onChange={(e) => onChangeFocusExamId(e.target.value)}
                  className="h-8 w-full rounded-lg border border-border bg-surface-subtle px-2.5 text-xs font-medium text-ink-muted focus:border-accent focus:outline-none"
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title} ({ex.lifecycle})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Donut + Status Counts */}
            <div className="mt-4 flex items-center gap-5">
              <div className="relative h-36 w-36 shrink-0 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={60}
                      paddingAngle={hasDonutData && donutData.length > 1 ? 3 : 0}
                      stroke="none"
                    >
                      {donutData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-bold leading-none text-foreground">
                    {centerPct}%
                  </span>
                  <span className="mt-1 text-[11px] font-medium text-ink-subtle">
                    {centerLabel}
                  </span>
                </div>
              </div>

              <div className="flex-1 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-ink-muted">
                    <span className="h-2 w-2 rounded-full bg-emerald-600" />
                    In Progress
                  </span>
                  <span className="font-bold text-foreground">{inProgressCount}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-ink-muted">
                    <span className="h-2 w-2 rounded-full bg-accent" />
                    Submitted
                  </span>
                  <span className="font-bold text-foreground">{submittedCount}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-ink-muted">
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    Not Started
                  </span>
                  <span className="font-bold text-foreground">{notStartedCount}</span>
                </div>
              </div>
            </div>

            {/* Live Activity Feed */}
            <div className="mt-4 space-y-2 rounded-xl border border-border bg-surface-subtle p-3">
              {!live || live.feed.length === 0 ? (
                <p className="py-2 text-center text-xs text-ink-subtle">
                  No recent live session events recorded yet.
                </p>
              ) : (
                live.feed.slice(0, 3).map((ev) => {
                  const dotColor =
                    ev.kind === "alert"
                      ? "bg-amber-500"
                      : ev.kind === "announcement"
                        ? "bg-accent"
                        : "bg-emerald-500";
                  return (
                    <div key={ev.id} className="flex items-start gap-2.5 text-xs">
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                      <span className="w-16 shrink-0 text-[11px] text-slate-400">
                        {formatDistanceToNow(new Date(ev.at), { addSuffix: false }).replace(
                          /^about\s+/,
                          ""
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ink-muted">{ev.message}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Send Announcement Interactive Composer */}
          <div className="mt-3">
            {showAnnouncementBox ? (
              <form onSubmit={handleAnnouncementSubmit} className="flex items-center gap-2">
                <Input
                  value={announcementText}
                  onChange={(e) => setAnnouncementText(e.target.value)}
                  placeholder="Broadcast message to candidates…"
                  className="h-9 text-xs"
                  autoFocus
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={announcementMut.isPending || !announcementText.trim()}
                >
                  {announcementMut.isPending ? <Spinner /> : "Send"}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowAnnouncementBox(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-surface-muted cursor-pointer"
                  aria-label="Cancel announcement"
                >
                  <X className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!live) {
                    toast.error("Create an exam first to broadcast announcements");
                    return;
                  }
                  setShowAnnouncementBox(true);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-subtle py-2 text-xs font-semibold text-accent transition hover:bg-accent-soft cursor-pointer"
              >
                <Radio className="h-3.5 w-3.5" /> Send Announcement
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Create New Exam + Insights + Quick Tools */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Create New Exam */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-2xs lg:col-span-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
              <PlusCircle className="h-4.5 w-4.5 text-accent" />
              Create New Exam
            </h2>
            <p className="mt-1 text-xs text-ink-subtle">
              Set up a new examination in minutes
            </p>
          </div>

          <div className="my-4 flex items-center gap-3">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 text-accent">
              <div className="relative">
                <ClipboardCheck className="h-10 w-10" />
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface text-accent shadow-xs">
                  <Clock className="h-3 w-3" />
                </span>
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <button
                type="button"
                onClick={onCreateNew}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#1d4ed8] px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1e40af] cursor-pointer"
              >
                Create Exam <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowTemplatesModal(true)}
                className="flex w-full items-center justify-center rounded-xl bg-surface-muted px-3 py-2 text-xs font-semibold text-ink-muted transition hover:bg-slate-200 cursor-pointer"
              >
                Use Template
              </button>
            </div>
          </div>
        </div>

        {/* Insights Chart */}
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs lg:col-span-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
                <BarChart3 className="h-4.5 w-4.5 text-accent" />
                Insights
              </h2>
              <div className="mt-1 flex items-center gap-4 text-xs text-ink-subtle">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-accent" /> Attempts
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Pass Rate
                </span>
              </div>
            </div>

            <select
              aria-label="Insights time range"
              value={days}
              onChange={(e) => onChangeDays(Number(e.target.value) as 7 | 30)}
              className="h-8 rounded-lg border border-border bg-surface-subtle px-2.5 text-xs font-medium text-ink-muted focus:border-accent focus:outline-none"
            >
              <option value={7}>Last 7 Days</option>
              <option value={30}>Last 30 Days</option>
            </select>
          </div>

          <div className="h-44 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="examinerAttemptsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#46351a" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#46351a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="examinerPassGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="pct"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="count"
                  orientation="right"
                  hide
                  allowDecimals={false}
                  domain={[0, "dataMax + 2"]}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    borderColor: "#e2e8f0",
                    fontSize: "12px",
                  }}
                />
                <Area
                  yAxisId="count"
                  type="monotone"
                  dataKey="attempts"
                  name="Attempts"
                  stroke="#46351a"
                  strokeWidth={2}
                  fill="url(#examinerAttemptsGrad)"
                />
                <Area
                  yAxisId="pct"
                  type="monotone"
                  dataKey="passRate"
                  name="Pass Rate (%)"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#examinerPassGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick Tools */}
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs lg:col-span-4">
          <h2 className="mb-3.5 flex items-center gap-2 text-base font-bold text-foreground">
            <Wrench className="h-4.5 w-4.5 text-accent" />
            Quick Tools
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onNavigateTab("results")}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-[#f0f6ff] px-3 py-4 text-center transition hover:bg-blue-100/60 cursor-pointer"
            >
              <BarChart3 className="h-5 w-5 text-accent" />
              <span className="text-xs font-semibold text-foreground leading-tight">
                View Results
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowPdfModal(true)}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-rose-100 bg-[#fff3f2] px-3 py-4 text-center transition hover:bg-rose-100/60 cursor-pointer"
            >
              <FileDown className="h-5 w-5 text-rose-500" />
              <span className="text-xs font-semibold text-foreground leading-tight">
                Generate PDF
                <br />
                Reports
              </span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab("analytics")}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-[#f3f4ff] px-3 py-4 text-center transition hover:bg-indigo-100/60 cursor-pointer"
            >
              <PieChartIcon className="h-5 w-5 text-accent" />
              <span className="text-xs font-semibold text-foreground leading-tight">
                Question Analytics
              </span>
            </button>

            <button
              type="button"
              onClick={() => onVerifyIntegrity()}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-violet-100 bg-[#f5f3ff] px-3 py-4 text-center transition hover:bg-violet-100/60 cursor-pointer"
            >
              <ShieldCheck className="h-5 w-5 text-violet-600" />
              <span className="text-xs font-semibold text-foreground leading-tight">
                Verify Records
                <br />
                Integrity
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Exam Templates Modal */}
      {showTemplatesModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Choose Exam Template"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Choose an Examination Template
                </h3>
                <p className="text-xs text-ink-subtle">
                  Pre-populates timing, randomization blueprint, partial credit, and security policies.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTemplatesModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-surface-muted cursor-pointer"
                aria-label="Close templates"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {EXAM_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    setShowTemplatesModal(false);
                    onUseTemplate(tpl);
                  }}
                  className="flex flex-col justify-between rounded-xl border border-border bg-surface-subtle p-4 text-left transition hover:border-blue-400 hover:bg-accent-soft/40 cursor-pointer"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-foreground">{tpl.name}</span>
                      <Badge tone="accent">{tpl.badge}</Badge>
                    </div>
                    <p className="mt-1.5 text-xs text-ink-muted">{tpl.description}</p>
                  </div>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent">
                    Use This Template <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Generate PDF Reports Modal */}
      {showPdfModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Generate PDF Reports"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Generate Cryptographic PDF Reports
                </h3>
                <p className="text-xs text-ink-subtle">
                  Download exam summary reports with fairness audits &amp; QR verification links, or individual candidate certificates.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPdfModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-surface-muted cursor-pointer"
                aria-label="Close PDF generator"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {exams.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-subtle">
                Create an exam first to generate PDF reports.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-52">
                    <label
                      htmlFor="pdf-exam-select"
                      className="mb-1 block text-xs font-semibold text-ink-muted"
                    >
                      Select Examination
                    </label>
                    <select
                      id="pdf-exam-select"
                      value={activePdfExamId}
                      onChange={(e) => setPdfExamId(e.target.value)}
                      className="h-10 w-full rounded-xl border border-border bg-surface-subtle px-3 text-sm text-foreground"
                    >
                      {exams.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.title} ({ex.submittedCount} submitted)
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    onClick={async () => {
                      const ex = exams.find((x) => x.id === activePdfExamId);
                      if (!ex) return;
                      try {
                        await api.reports.downloadExamPdf(ex.id, ex.title);
                        toast.success("Exam Summary PDF downloaded");
                      } catch (err) {
                        toast.error((err as Error).message);
                      }
                    }}
                  >
                    <FileDown className="h-4 w-4" /> Download Exam Summary PDF
                  </Button>
                </div>

                <div className="rounded-xl border border-border bg-surface-subtle">
                  <div className="border-b border-border px-4 py-2.5 text-xs font-semibold text-ink-muted">
                    Individual Candidate Result PDFs
                  </div>
                  {pdfExamAnalyticsQuery.isLoading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-xs text-ink-subtle">
                      <Spinner /> Loading submissions…
                    </div>
                  ) : (pdfExamAnalyticsQuery.data?.candidates ?? []).length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-ink-subtle">
                      No candidate attempts recorded for this exam yet.
                    </p>
                  ) : (
                    <div className="max-h-60 divide-y divide-border overflow-y-auto">
                      {(pdfExamAnalyticsQuery.data?.candidates ?? []).map((c) => {
                        const attId = c.attemptId ?? c.id ?? "";
                        const code = c.verifyCode ?? c.verify_code ?? "";
                        const max = c.maxScore ?? c.max_score ?? 0;
                        return (
                          <div
                            key={attId}
                            className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-foreground">
                                {c.candidate?.name ?? c.name ?? "Candidate"}
                              </p>
                              <p className="truncate text-[11px] text-ink-subtle">
                                {c.status} ·{" "}
                                {c.score !== null && c.score !== undefined
                                  ? `${c.score} / ${max}`
                                  : "Pending"}{" "}
                                {code ? `· ${code}` : ""}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={async () => {
                                try {
                                  await api.reports.downloadAttemptPdf(attId, code);
                                  toast.success("Candidate Result PDF downloaded");
                                } catch (err) {
                                  toast.error((err as Error).message);
                                }
                              }}
                            >
                              <FileDown className="h-3.5 w-3.5" /> PDF
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
