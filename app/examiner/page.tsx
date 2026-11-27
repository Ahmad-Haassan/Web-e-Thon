"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  FileDown,
  FileText,
  Home,
  LogOut,
  Menu,
  Plus,
  Scale,
  Search,
  Settings,
  Settings2,
  ShieldCheck,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useAuth, roleHomePath } from "@/hooks/use-auth";
import {
  Badge,
  Button,
  EmptyState,
  Label,
  Select,
  Spinner,
} from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import {
  computeClientLifecycle,
  examDurationMin,
  examEndAt,
  examResultsPublished,
  examStartAt,
  examTotalMarks,
  type ComputedExamLifecycle,
  type WorkspacePrefs,
} from "@/lib/client/api-types";

type ExaminerTab = "dashboard" | "exams" | "settings";

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

function lifecycleTone(lc: ComputedExamLifecycle) {
  switch (lc) {
    case "ONGOING":
      return "verified" as const;
    case "PUBLISHED":
      return "accent" as const;
    case "COMPLETED":
      return "neutral" as const;
    default:
      return "warning" as const;
  }
}

export default function ExaminerDashboardPage() {
  const router = useRouter();
  const { user, loading, signOut, updatePrefs } = useAuth();

  const [activeTab, setActiveTab] = useState<ExaminerTab>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showNotif, setShowNotif] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/examiner");
      return;
    }
    if (!["ADMIN", "EXAMINER"].includes(user.role)) {
      router.replace(roleHomePath(user.role));
    }
  }, [user, loading, router]);

  const isAllowed = Boolean(user && ["ADMIN", "EXAMINER"].includes(user.role));

  const examsQuery = useQuery({
    queryKey: ["examiner-exams"],
    queryFn: () => api.exams.list(),
    enabled: isAllowed,
  });

  const disputesQuery = useQuery({
    queryKey: ["examiner-disputes-summary"],
    queryFn: () => api.disputes.list({ status: "OPEN" }),
    enabled: isAllowed,
  });

  if (loading || !user || !isAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f6fb]">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <Spinner className="h-5 w-5 text-blue-600" />
          Loading Examiner Portal…
        </div>
      </div>
    );
  }

  const allExams = examsQuery.data?.exams ?? [];
  const q = search.trim().toLowerCase();
  const exams = allExams.filter((e) => !q || e.title.toLowerCase().includes(q));

  const ongoingExams = exams.filter((e) => computeClientLifecycle(e) === "ONGOING");
  const upcomingOrDraft = exams.filter((e) => {
    const lc = computeClientLifecycle(e);
    return lc === "PUBLISHED" || lc === "DRAFT";
  });
  const completedExams = exams.filter((e) => computeClientLifecycle(e) === "COMPLETED");
  const openDisputes = disputesQuery.data?.disputes ?? [];

  const publishedCount = allExams.filter((e) => e.status === "PUBLISHED").length;
  const resultsPublishedCount = allExams.filter((e) => examResultsPublished(e)).length;
  const publishedPct = allExams.length
    ? Math.round((publishedCount / allExams.length) * 100)
    : 0;

  const firstName = user.name?.split(/\s+/)[0] || "Examiner";
  const featuredExam = ongoingExams[0] ?? allExams[0];
  const verifyTargetUrl = featuredExam
    ? `${typeof window !== "undefined" ? window.location.origin : "https://web-e-thon.vercel.app"}/verify?examId=${featuredExam.id}`
    : `${typeof window !== "undefined" ? window.location.origin : "https://web-e-thon.vercel.app"}/verify`;

  const ringRadius = 38;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (publishedPct / 100) * ringCircumference;

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen bg-[#f4f6fb] text-slate-900">
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Dark Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#141824] text-slate-200 transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-md">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base font-bold leading-tight text-white">VeriExam</p>
              <p className="text-xs text-slate-400">Examiner Portal</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-2 flex-1 space-y-1 px-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab("dashboard");
              setMobileMenuOpen(false);
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white shadow-md shadow-blue-950/40"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Home className={`h-4.5 w-4.5 ${activeTab === "dashboard" ? "text-white" : "text-slate-400"}`} />
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("exams");
              setMobileMenuOpen(false);
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all cursor-pointer ${
              activeTab === "exams"
                ? "bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white shadow-md shadow-blue-950/40"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <ClipboardList className={`h-4.5 w-4.5 ${activeTab === "exams" ? "text-white" : "text-slate-400"}`} />
            <span>My Exams</span>
          </button>

          <Link
            href="/examiner/questions"
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-300 transition-all hover:bg-white/5 hover:text-white"
          >
            <BookOpen className="h-4.5 w-4.5 text-slate-400" />
            <span>Question Bank</span>
          </Link>

          <Link
            href="/examiner/exams/new"
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-300 transition-all hover:bg-white/5 hover:text-white"
          >
            <Plus className="h-4.5 w-4.5 text-slate-400" />
            <span>Create Exam</span>
          </Link>

          <Link
            href="/disputes"
            className="flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-300 transition-all hover:bg-white/5 hover:text-white"
          >
            <span className="flex items-center gap-3">
              <Scale className="h-4.5 w-4.5 text-slate-400" />
              <span>Disputes</span>
            </span>
            {openDisputes.length > 0 && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                {openDisputes.length}
              </span>
            )}
          </Link>

          <Link
            href="/verify"
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-300 transition-all hover:bg-white/5 hover:text-white"
          >
            <ShieldCheck className="h-4.5 w-4.5 text-slate-400" />
            <span>Verify Audit</span>
          </Link>

          <button
            type="button"
            onClick={() => {
              setActiveTab("settings");
              setMobileMenuOpen(false);
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all cursor-pointer ${
              activeTab === "settings"
                ? "bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white shadow-md shadow-blue-950/40"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Settings className={`h-4.5 w-4.5 ${activeTab === "settings" ? "text-white" : "text-slate-400"}`} />
            <span>Settings</span>
          </button>
        </nav>

        <div className="space-y-2.5 p-4">
          <div className="rounded-xl border border-white/10 bg-[#1d2233] p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span
                className={`h-2.5 w-2.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-amber-400"}`}
              />
              <span className={isOnline ? "text-emerald-400" : "text-amber-300"}>
                {isOnline ? "Online" : "Reconnecting…"}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {ongoingExams.length} live exam(s) active
            </p>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-[#1d2233] px-3.5 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <LogOut className="h-4 w-4 text-slate-400" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-4 sm:px-7">
          <div className="flex flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search exams..."
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowNotif((v) => !v);
                  setShowProfile(false);
                }}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {(openDisputes.length + ongoingExams.length) > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {openDisputes.length + ongoingExams.length}
                  </span>
                )}
              </button>
              {showNotif && (
                <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                  <p className="border-b border-slate-100 pb-2 text-sm font-semibold text-slate-900">
                    Examiner Alerts
                  </p>
                  <div className="mt-3 space-y-2 text-xs">
                    <p className="text-slate-600">
                      <strong>{ongoingExams.length}</strong> live exam(s) in progress
                    </p>
                    <p className="text-slate-600">
                      <strong>{openDisputes.length}</strong> open student dispute(s)
                    </p>
                    <Link
                      href="/disputes"
                      className="inline-flex items-center gap-1 pt-1 font-semibold text-blue-600 hover:underline"
                    >
                      Review disputes <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Profile */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowProfile((v) => !v);
                  setShowNotif(false);
                }}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 hover:bg-slate-100 cursor-pointer"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#312e81] text-xs font-bold text-white">
                  {initialsOf(user.name)}
                </span>
                <span className="hidden text-sm font-medium text-slate-700 sm:inline">
                  {user.name}
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>

              {showProfile && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {user.role === "ADMIN" && (
                      <Link
                        href="/admin"
                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                      >
                        <ShieldCheck className="h-4 w-4" /> Admin Panel
                      </Link>
                    )}
                    <Link
                      href="/examiner/questions"
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <BookOpen className="h-4 w-4 text-slate-400" /> Question Bank
                    </Link>
                    <Link
                      href="/disputes"
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <AlertTriangle className="h-4 w-4 text-slate-400" /> Disputes
                    </Link>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 cursor-pointer"
                    >
                      <LogOut className="h-4 w-4" /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Body */}
        <main className="flex-1 p-4 sm:p-7">
          {examsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
              <Spinner className="h-5 w-5 text-blue-600" /> Loading your exams…
            </div>
          ) : examsQuery.error ? (
            <div className="mx-auto max-w-4xl rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
              {(examsQuery.error as Error).message}
            </div>
          ) : activeTab === "dashboard" ? (
            <div className="mx-auto max-w-6xl space-y-6">
              {/* Hero Welcome Banner */}
              <div className="relative overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-r from-[#e8f0ff] via-[#dfe9ff] to-[#d6e4ff] px-6 py-7 sm:px-9 sm:py-8">
                <div className="relative z-10 max-w-xl">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                    Welcome back, {firstName}!
                  </h1>
                  <p className="mt-2 text-sm text-slate-600">
                    Design fair blueprint exams, monitor live sessions transparently, and publish cryptographically verifiable results.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2.5">
                    <Link
                      href="/examiner/exams/new"
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4" /> Create New Exam
                    </Link>
                    <Link
                      href="/examiner/questions"
                      className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white/90 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-white"
                    >
                      <BookOpen className="h-4 w-4" /> Question Bank
                    </Link>
                  </div>
                </div>

                {/* Decorative Emblem */}
                <div className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 items-center gap-4 md:flex">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 text-white shadow-lg shadow-teal-500/20">
                    <ShieldCheck className="h-9 w-9" />
                  </div>
                  <div className="flex h-24 w-32 flex-col items-center justify-center rounded-2xl border border-blue-200/70 bg-white/75 backdrop-blur-xs shadow-sm">
                    <ClipboardList className="h-10 w-10 text-blue-700" />
                    <span className="mt-1 text-[10px] font-semibold text-blue-700">
                      Live Monitor
                    </span>
                  </div>
                </div>
              </div>

              {/* 2-Column Main Grid */}
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Left 2 Columns */}
                <div className="space-y-6 lg:col-span-2">
                  {/* Live / Ongoing Exams */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                        <Activity className="h-4.5 w-4.5 text-blue-600" />
                        Active &amp; Live Exams
                      </h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab("exams")}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                      >
                        View All <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {ongoingExams.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-sm text-slate-500">
                        No exams are currently live. Create or publish an exam to begin live monitoring.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {ongoingExams.map((exam) => {
                          const published = examResultsPublished(exam);
                          return (
                            <div
                              key={exam.id}
                              className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4"
                            >
                              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-4">
                                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-600">
                                    <ClipboardList className="h-8 w-8" />
                                  </div>
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Link
                                        href={`/examiner/exams/${exam.id}`}
                                        className="text-base font-bold text-slate-900 hover:text-blue-600"
                                      >
                                        {exam.title}
                                      </Link>
                                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                        Live Now
                                      </span>
                                      {published && (
                                        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                                          Results Published
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {examTotalMarks(exam)} Marks ·{" "}
                                      {exam.blueprint && exam.blueprint.length > 0
                                        ? "Fair Blueprint Randomization"
                                        : "Fixed Paper"}
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                                      <span className="inline-flex items-center gap-1">
                                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                        Closes {fmtDate(examEndAt(exam))}
                                      </span>
                                      <span className="inline-flex items-center gap-1">
                                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                                        {examDurationMin(exam)} min
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                  <Link
                                    href={`/examiner/exams/${exam.id}?tab=monitor`}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700"
                                  >
                                    <Activity className="h-4 w-4" /> Live Monitor
                                  </Link>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3">
                                <Link href={`/examiner/exams/${exam.id}`}>
                                  <Button size="sm" variant="secondary">
                                    <Settings2 className="h-3.5 w-3.5" /> Manage &amp; Enroll
                                  </Button>
                                </Link>
                                <Link href={`/examiner/exams/${exam.id}?tab=grading`}>
                                  <Button size="sm" variant="secondary">
                                    <BarChart3 className="h-3.5 w-3.5" /> Grading &amp; Analytics
                                  </Button>
                                </Link>
                                <Button
                                  size="sm"
                                  variant="ghost"
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
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Upcoming & Draft Exams */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
                    <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
                      <Clock className="h-4.5 w-4.5 text-blue-600" />
                      Upcoming &amp; Draft Exams
                    </h2>
                    {upcomingOrDraft.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No upcoming or draft exams. Click &quot;Create New Exam&quot; above to schedule one.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {upcomingOrDraft.map((exam) => {
                          const lc = computeClientLifecycle(exam);
                          return (
                            <Link
                              key={exam.id}
                              href={`/examiner/exams/${exam.id}`}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 transition hover:border-blue-200 hover:bg-blue-50/40"
                            >
                              <div className="flex items-center gap-3.5">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                                  <FileText className="h-5 w-5" />
                                </span>
                                <div>
                                  <p className="text-sm font-bold text-slate-900">{exam.title}</p>
                                  <p className="mt-0.5 text-xs text-slate-500">
                                    Opens {fmtDate(examStartAt(exam))} · {examDurationMin(exam)} min
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge tone={lifecycleTone(lc)}>{lc}</Badge>
                                <ChevronRight className="h-4 w-4 text-slate-400" />
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Recent Completed / Disputes Activity */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
                    <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
                      <CheckCircle2 className="h-4.5 w-4.5 text-blue-600" />
                      Recent Activity &amp; Disputes
                    </h2>
                    {completedExams.length === 0 && openDisputes.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Completed exams and open student disputes will show up here.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {openDisputes.slice(0, 3).map((d) => (
                          <Link
                            key={d.id}
                            href="/disputes"
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3.5 hover:bg-amber-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
                                <AlertTriangle className="h-5 w-5" />
                              </span>
                              <div>
                                <p className="text-sm font-bold text-slate-900">
                                  Open {d.type} Dispute
                                </p>
                                <p className="text-xs text-slate-600 line-clamp-1">{d.reason}</p>
                              </div>
                            </div>
                            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                              Review
                            </span>
                          </Link>
                        ))}

                        {completedExams.slice(0, 3).map((exam) => (
                          <Link
                            key={exam.id}
                            href={`/examiner/exams/${exam.id}?tab=grading`}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 hover:bg-slate-100/70"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                                <CheckCircle2 className="h-5 w-5" />
                              </span>
                              <div>
                                <p className="text-sm font-bold text-slate-900">{exam.title}</p>
                                <p className="text-xs text-slate-500">
                                  Ended{" "}
                                  {formatDistanceToNow(new Date(examEndAt(exam)), {
                                    addSuffix: true,
                                  })}
                                </p>
                              </div>
                            </div>
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                              Completed
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                  {/* Quick Examiner Tools */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
                    <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
                      <Zap className="h-4.5 w-4.5 text-blue-600" />
                      Examiner Toolkit
                    </h2>
                    <div className="space-y-3">
                      <Link
                        href="/examiner/exams/new"
                        className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-slate-50"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                          <Plus className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Create Fair Exam</p>
                          <p className="text-xs text-slate-500">Blueprint &amp; seed commitment</p>
                        </div>
                      </Link>
                      <Link
                        href="/examiner/questions"
                        className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-slate-50"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                          <BookOpen className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Question Bank &amp; CSV</p>
                          <p className="text-xs text-slate-500">Single, Multi &amp; Written</p>
                        </div>
                      </Link>
                      <Link
                        href="/disputes"
                        className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-slate-50"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                          <Scale className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Evidence &amp; Disputes</p>
                          <p className="text-xs text-slate-500">
                            {openDisputes.length} open case(s) to review
                          </p>
                        </div>
                      </Link>
                    </div>
                  </div>

                  {/* Exam Overview Ring Card */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                        <Trophy className="h-4.5 w-4.5 text-amber-500" />
                        Exam Overview
                      </h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab("exams")}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                      >
                        View All <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-5">
                      <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
                        <svg className="h-24 w-24 -rotate-90" viewBox="0 0 96 96">
                          <circle
                            cx="48"
                            cy="48"
                            r={ringRadius}
                            fill="none"
                            stroke="#e2e8f0"
                            strokeWidth="8"
                          />
                          <circle
                            cx="48"
                            cy="48"
                            r={ringRadius}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={ringCircumference}
                            strokeDashoffset={ringOffset}
                          />
                        </svg>
                        <div className="absolute text-center">
                          <p className="text-lg font-bold text-slate-900">{publishedPct}%</p>
                          <p className="text-[9px] text-slate-500">Published</p>
                        </div>
                      </div>

                      <div className="flex-1 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Live Now
                          </span>
                          <span className="font-bold text-slate-900">{ongoingExams.length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <span className="h-2 w-2 rounded-full bg-blue-500" /> Total Exams
                          </span>
                          <span className="font-bold text-slate-900">{allExams.length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <span className="h-2 w-2 rounded-full bg-violet-500" /> Results Published
                          </span>
                          <span className="font-bold text-slate-900">{resultsPublishedCount}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Public Audit Verification Card with QR */}
                  <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-[#f3f0ff] to-[#ebe8ff] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
                            <ShieldCheck className="h-4 w-4" />
                          </span>
                          Verify Exam Audit
                        </h3>
                        <p className="mt-2 text-xs text-slate-600">
                          Inspect cryptographic hash chains, seed commitments, and signed exam checkpoints.
                        </p>
                        <Link
                          href={featuredExam ? `/verify?examId=${encodeURIComponent(featuredExam.id)}` : "/verify"}
                          className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-indigo-700 shadow-2xs hover:bg-indigo-50"
                        >
                          Verify Now <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                      <div className="shrink-0 rounded-xl bg-white p-2 shadow-2xs">
                        <QRCodeSVG value={verifyTargetUrl} size={64} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === "exams" ? (
            <div className="mx-auto max-w-6xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">All My Examinations ({exams.length})</h1>
                  <p className="text-sm text-slate-500">
                    Manage enrollments, monitor live candidates, grade written responses, and export PDFs.
                  </p>
                </div>
                <Link href="/examiner/exams/new">
                  <Button>
                    <Plus className="h-4 w-4" /> Create Exam
                  </Button>
                </Link>
              </div>

              {exams.length === 0 ? (
                <EmptyState
                  title="No exams found"
                  description="Create your first exam or clear your search filter."
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {exams.map((exam) => {
                    const lc = computeClientLifecycle(exam);
                    const published = examResultsPublished(exam);
                    const enrollCount = exam.enrollmentCount ?? exam.enrollment_count;
                    return (
                      <div
                        key={exam.id}
                        className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4"
                      >
                        <div>
                          <div className="mb-2 flex flex-wrap items-center gap-1.5">
                            <Badge tone={lifecycleTone(lc)}>{lc}</Badge>
                            {published && <Badge tone="verified">Results Published</Badge>}
                          </div>
                          <Link
                            href={`/examiner/exams/${exam.id}`}
                            className="text-base font-bold text-slate-900 hover:text-blue-600"
                          >
                            {exam.title}
                          </Link>
                          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-slate-400" />
                              {fmtDate(examStartAt(exam))}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-slate-400" />
                              {examDurationMin(exam)} min
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5 text-slate-400" />
                              {enrollCount !== undefined ? `${enrollCount} enrolled` : `${examTotalMarks(exam)} pts`}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Link href={`/examiner/exams/${exam.id}`}>
                            <Button size="sm">
                              <Settings2 className="h-3.5 w-3.5" /> Manage
                            </Button>
                          </Link>
                          <Link href={`/examiner/exams/${exam.id}?tab=monitor`}>
                            <Button size="sm" variant="secondary">
                              <Activity className="h-3.5 w-3.5" /> Monitor
                            </Button>
                          </Link>
                          <Link href={`/examiner/exams/${exam.id}?tab=grading`}>
                            <Button size="sm" variant="secondary">
                              <BarChart3 className="h-3.5 w-3.5" /> Analytics
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => api.reports.downloadExamPdf(exam.id, exam.title)}
                          >
                            <FileDown className="h-3.5 w-3.5" /> PDF
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-5">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Examiner Workspace Preferences</h1>
                <p className="text-sm text-slate-500">
                  Saved directly to your account via <code className="font-mono">/api/me/prefs</code>.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="ex-font">Font Size</Label>
                  <Select
                    id="ex-font"
                    value={user.prefs?.fontSize ?? "md"}
                    onChange={(e) => {
                      updatePrefs({ fontSize: e.target.value as WorkspacePrefs["fontSize"] });
                      toast.success("Font size saved");
                    }}
                  >
                    <option value="sm">Small</option>
                    <option value="md">Medium</option>
                    <option value="lg">Large</option>
                    <option value="xl">Extra Large</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="ex-theme">Theme</Label>
                  <Select
                    id="ex-theme"
                    value={user.prefs?.theme ?? "light"}
                    onChange={(e) => {
                      updatePrefs({ theme: e.target.value as WorkspacePrefs["theme"] });
                      toast.success("Theme saved");
                    }}
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">System</option>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
