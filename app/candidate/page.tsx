"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  Activity,
  ArrowRight,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileCheck2,
  FileDown,
  FileText,
  Home,
  Laptop,
  Lock,
  LogOut,
  Menu,
  Play,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Trophy,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useAuth, roleHomePath } from "@/hooks/use-auth";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Label,
  Select,
  Spinner,
  ThemeToggleButton,
} from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import {
  attemptMaxScore,
  attemptVerifyCode,
  computeClientLifecycle,
  examDurationMin,
  examEndAt,
  examResultsPublished,
  examStartAt,
  examTotalMarks,
  type ExamRecord,
  type WorkspacePrefs,
} from "@/lib/client/api-types";

type StudentTab = "dashboard" | "exams" | "results" | "receipts" | "verify" | "settings";

const STUDENT_NAV: { id: StudentTab; label: string; icon: typeof Home }[] = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "exams", label: "My Exams", icon: BookOpen },
  { id: "results", label: "Results", icon: BarChart3 },
  { id: "receipts", label: "Receipts", icon: FileText },
  { id: "verify", label: "Verify Result", icon: ShieldCheck },
  { id: "settings", label: "Settings", icon: Settings },
];

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, "MMM d, yyyy · hh:mm a");
}

function initialsOf(name?: string) {
  if (!name) return "ST";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase() || "ST";
}

export default function CandidateDashboardPage() {
  const router = useRouter();
  const { user, loading, signOut, updatePrefs } = useAuth();

  const [activeTab, setActiveTab] = useState<StudentTab>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showNotif, setShowNotif] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const [ackExam, setAckExam] = useState<ExamRecord | null>(null);
  const [ackChecked, setAckChecked] = useState(false);

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
      router.replace("/login?next=/candidate");
      return;
    }
    if (!user.active) {
      router.replace("/pending-approval");
      return;
    }
    if (!["CANDIDATE", "ADMIN", "EXAMINER"].includes(user.role)) {
      router.replace(roleHomePath(user.role));
    }
  }, [user, loading, router]);

  const examsQuery = useQuery({
    queryKey: ["candidate-exams"],
    queryFn: () => api.exams.list(),
    enabled: Boolean(user && user.active),
    refetchOnWindowFocus: true,
  });

  const startMut = useMutation({
    mutationFn: (examId: string) =>
      api.attempts.start(examId, { isSandbox: false, integrityAck: true }),
    onSuccess: (res) => {
      setAckExam(null);
      setAckChecked(false);
      router.push(`/exam/${res.attempt.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <Spinner className="h-5 w-5 text-accent" />
          Loading Student Portal…
        </div>
      </div>
    );
  }

  // Normalize available / upcoming / completed lists
  const rawAvailable = [...(examsQuery.data?.available ?? [])];
  const rawUpcoming = [...(examsQuery.data?.upcoming ?? [])];
  const rawCompleted = [...(examsQuery.data?.completed ?? [])];

  if (
    rawAvailable.length === 0 &&
    rawUpcoming.length === 0 &&
    rawCompleted.length === 0 &&
    examsQuery.data?.exams?.length
  ) {
    for (const ex of examsQuery.data.exams) {
      const lc = computeClientLifecycle(ex);
      const st = ex.attempt?.status;
      if (st === "SUBMITTED" || st === "EXPIRED" || st === "GRADED" || lc === "COMPLETED") {
        rawCompleted.push(ex);
      } else if (lc === "ONGOING") {
        rawAvailable.push(ex);
      } else {
        rawUpcoming.push(ex);
      }
    }
  }

  const q = search.trim().toLowerCase();
  const match = (e: ExamRecord) => !q || e.title.toLowerCase().includes(q);
  const available = rawAvailable.filter(match);
  const upcoming = rawUpcoming.filter(match);
  const completed = rawCompleted.filter(match);

  // Result stats for circular progress ring
  const gradedWithScore = rawCompleted.filter(
    (e) =>
      examResultsPublished(e) &&
      e.attempt &&
      e.attempt.score !== null &&
      e.attempt.score !== undefined &&
      attemptMaxScore(e.attempt) > 0
  );
  const pctList = gradedWithScore.map((e) =>
    Math.round((Number(e.attempt!.score) / attemptMaxScore(e.attempt!)) * 100)
  );
  const avgPct = pctList.length
    ? Math.round(pctList.reduce((a, b) => a + b, 0) / pctList.length)
    : 0;
  const passedCount = pctList.filter((p) => p >= 50).length;
  const totalAttempts =
    rawCompleted.filter((e) => Boolean(e.attempt)).length +
    rawAvailable.filter((e) => Boolean(e.attempt)).length;

  const firstName = user.name?.split(/\s+/)[0] || "Student";
  const firstVerifyCode =
    rawCompleted.map((e) => (e.attempt ? attemptVerifyCode(e.attempt) : "")).find(Boolean) || "";
  const verifyTargetUrl = firstVerifyCode
    ? `${typeof window !== "undefined" ? window.location.origin : "https://web-e-thon.vercel.app"}/verify/${firstVerifyCode}`
    : `${typeof window !== "undefined" ? window.location.origin : "https://web-e-thon.vercel.app"}/verify`;

  const ringRadius = 38;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (avgPct / 100) * ringCircumference;

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Dark Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col portal-chrome text-slate-200 transition-transform duration-200 lg:static lg:translate-x-0 ${
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
              <p className="text-xs text-slate-400">Student Portal</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-surface/10 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-2 flex-1 space-y-1 px-3">
          {STUDENT_NAV.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setActiveTab(id);
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all cursor-pointer ${
                  active
                    ? "bg-[var(--portal-chrome-accent)] text-[#0b2922] font-semibold shadow-sm"
                    : "text-slate-300 hover:bg-surface/5 hover:text-white"
                }`}
              >
                <Icon className={`h-4.5 w-4.5 ${active ? "text-[#0b2922]" : "text-[var(--portal-chrome-muted)]"}`} />
                <span>{label}</span>
              </button>
            );
          })}

          <div className="pt-3 mt-3 border-t border-white/10 space-y-1">
            <Link
              href="/candidate/datesheet"
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--portal-chrome-muted)] transition-all hover:bg-white/5 hover:text-white"
            >
              <Calendar className="h-4 w-4" />
              <span>My Datesheet</span>
            </Link>
            <Link
              href="/candidate/admit-card"
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--portal-chrome-muted)] transition-all hover:bg-white/5 hover:text-white"
            >
              <Receipt className="h-4 w-4" />
              <span>Admit Card</span>
            </Link>
            <Link
              href="/profile"
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--portal-chrome-muted)] transition-all hover:bg-white/5 hover:text-white"
            >
              <Settings className="h-4 w-4" />
              <span>My Profile</span>
            </Link>
          </div>
        </nav>

        <div className="space-y-2.5 p-4">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span
                className={`h-2.5 w-2.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-amber-400"}`}
              />
              <span className={isOnline ? "text-emerald-400" : "text-amber-300"}>
                {isOnline ? "Online" : "Offline Mode"}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {isOnline ? "Last seen: just now" : "Local IndexedDB queue active"}
            </p>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-surface/10 hover:text-white cursor-pointer"
          >
            <LogOut className="h-4 w-4 text-slate-400" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-7">
          <div className="flex flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted lg:hidden"
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
                className="h-9 w-full rounded-xl border border-border bg-surface-subtle pl-10 pr-4 text-sm text-foreground placeholder:text-slate-400 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggleButton />
            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowNotif((v) => !v);
                  setShowProfile(false);
                }}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-muted cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {available.length > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {available.length}
                  </span>
                )}
              </button>
              {showNotif && (
                <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-border bg-surface p-4 shadow-xl">
                  <p className="border-b border-border pb-2 text-sm font-semibold text-foreground">
                    Exam Alerts
                  </p>
                  <div className="mt-3 space-y-2 text-xs">
                    <p className="text-ink-muted">
                      <strong>{available.length}</strong> exam(s) open right now
                    </p>
                    <p className="text-ink-muted">
                      <strong>{upcoming.length}</strong> upcoming scheduled exam(s)
                    </p>
                    <Link
                      href="/disputes"
                      className="inline-flex items-center gap-1 pt-1 font-semibold text-accent hover:underline"
                    >
                      View my disputes <ArrowRight className="h-3 w-3" />
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
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 hover:bg-surface-muted cursor-pointer"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1b4d3e] text-xs font-bold text-white">
                  {initialsOf(user.name)}
                </span>
                <span className="hidden text-sm font-medium text-ink-muted sm:inline">
                  {user.name}
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>

              {showProfile && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-border bg-surface p-2 shadow-xl">
                  <div className="border-b border-border px-3 py-2">
                    <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                    <p className="truncate text-xs text-ink-subtle">{user.email}</p>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    <Link
                      href="/disputes"
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface-subtle"
                    >
                      <FileCheck2 className="h-4 w-4 text-slate-400" /> Disputes &amp; Appeals
                    </Link>
                    <Link
                      href="/verify"
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface-subtle"
                    >
                      <ShieldCheck className="h-4 w-4 text-emerald-500" /> Public Verifier
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

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-7">
          {examsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-ink-subtle">
              <Spinner className="h-5 w-5 text-accent" /> Loading your exams…
            </div>
          ) : examsQuery.error ? (
            <div className="mx-auto max-w-4xl rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
              {(examsQuery.error as Error).message}
            </div>
          ) : activeTab === "dashboard" ? (
            <div className="mx-auto max-w-6xl space-y-6">
              {/* Hero Welcome Banner */}
              <div className="relative overflow-hidden rounded-3xl border border-[#e6f1ec] bg-gradient-to-r from-[#e6f1ec] via-[#edf5f1] to-[#dcebe4] px-6 py-7 sm:px-9 sm:py-8">
                <div className="relative z-10 max-w-xl">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    Welcome back, {firstName}!
                  </h1>
                  <p className="mt-2 text-sm text-ink-muted">
                    Give your best. We&apos;re here to ensure a fair and secure exam experience.
                  </p>
                  <div className="mt-4 h-1 w-14 rounded-full bg-accent" />
                </div>

                {/* Decorative Shield + Laptop Emblem */}
                <div className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 items-center gap-4 md:flex">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 text-white shadow-lg shadow-teal-500/20">
                    <ShieldCheck className="h-9 w-9" />
                  </div>
                  <div className="flex h-24 w-32 flex-col items-center justify-center rounded-2xl border border-border-strong/70 bg-surface/75 backdrop-blur-xs shadow-sm">
                    <Laptop className="h-10 w-10 text-accent" />
                    <span className="mt-1 text-[10px] font-semibold text-accent">
                      Offline-Safe Sync
                    </span>
                  </div>
                </div>
              </div>

              {/* 2-Column Main Grid */}
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Left 2 columns */}
                <div className="space-y-6 lg:col-span-2">
                  {/* Available Exams */}
                  <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
                        <Calendar className="h-4.5 w-4.5 text-accent" />
                        Available Exams
                      </h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab("exams")}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent cursor-pointer"
                      >
                        View All <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {available.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border bg-surface-subtle p-6 text-center text-sm text-ink-subtle">
                        No exams open right now. Check Upcoming Exams below or your Results tab.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {available.map((exam) => {
                          const inProgress = exam.attempt?.status === "IN_PROGRESS";
                          return (
                            <div
                              key={exam.id}
                              className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-subtle/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="flex items-start gap-4">
                                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#e6f1ec] to-[#e6f1ec] text-accent">
                                  <Laptop className="h-8 w-8" />
                                </div>
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-base font-bold text-foreground">
                                      {exam.title}
                                    </h3>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                      {inProgress ? "In Progress" : "Available Now"}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-xs text-ink-subtle">
                                    {examTotalMarks(exam)} Marks · Server-Authoritative Timer
                                  </p>
                                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-subtle">
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

                              <div className="shrink-0">
                                {inProgress && exam.attempt ? (
                                  <Link
                                    href={`/exam/${exam.attempt.id}`}
                                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                                  >
                                    <Play className="h-4 w-4 fill-current" /> Resume Exam
                                  </Link>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAckExam(exam);
                                      setAckChecked(false);
                                    }}
                                    className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#c7dfd4] transition hover:bg-accent-hover cursor-pointer"
                                  >
                                    <Play className="h-4 w-4 fill-current" /> Start Exam
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Upcoming Exams */}
                  <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs">
                    <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-foreground">
                      <Clock className="h-4.5 w-4.5 text-accent" />
                      Upcoming Exams
                    </h2>
                    {upcoming.length === 0 ? (
                      <p className="text-sm text-ink-subtle">No upcoming scheduled exams right now.</p>
                    ) : (
                      <div className="space-y-3">
                        {upcoming.map((exam) => (
                          <div
                            key={exam.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-subtle/60 p-3.5"
                          >
                            <div className="flex items-center gap-3.5">
                              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e6f1ec] text-accent">
                                <FileText className="h-5 w-5" />
                              </span>
                              <div>
                                <p className="text-sm font-bold text-foreground">{exam.title}</p>
                                <p className="mt-0.5 text-xs text-ink-subtle">
                                  {fmtDate(examStartAt(exam))} · {examDurationMin(exam)} min
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eef5f1] px-3 py-1 text-xs font-semibold text-[#143b30]">
                                <Calendar className="h-3.5 w-3.5" />
                                Starts {formatDistanceToNow(new Date(examStartAt(exam)), { addSuffix: true })}
                              </span>
                              <ChevronRight className="h-4 w-4 text-slate-400" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recent Activity */}
                  <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs">
                    <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-foreground">
                      <Activity className="h-4.5 w-4.5 text-accent" />
                      Recent Activity
                    </h2>
                    {completed.length === 0 ? (
                      <p className="text-sm text-ink-subtle">
                        Your completed exams and cryptographic receipts will appear here.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {completed.slice(0, 4).map((exam) => {
                          const att = exam.attempt;
                          const published = examResultsPublished(exam);
                          return (
                            <div
                              key={exam.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-subtle/50 p-3.5"
                            >
                              <div className="flex items-center gap-3.5">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                                  <CheckCircle2 className="h-5 w-5" />
                                </span>
                                <div>
                                  <p className="text-sm font-bold text-foreground">
                                    Exam submitted successfully
                                  </p>
                                  <p className="text-xs text-ink-subtle">
                                    {exam.title} · {fmtDate(att?.submittedAt ?? examEndAt(exam))}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {att && published ? (
                                  <Link
                                    href={`/results/${att.id}`}
                                    className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                  >
                                    View Result
                                  </Link>
                                ) : (
                                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                    Completed
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                  {/* Quick Info */}
                  <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs">
                    <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-foreground">
                      <Zap className="h-4.5 w-4.5 text-accent" />
                      Quick Info
                    </h2>
                    <div className="space-y-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                          <ShieldCheck className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Secure &amp; Fair Exam</p>
                          <p className="text-xs text-ink-subtle">Your answers are protected</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                          <Lock className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Auto-Save Enabled</p>
                          <p className="text-xs text-ink-subtle">No data will be lost offline</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                          <Award className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Verified Results</p>
                          <p className="text-xs text-ink-subtle">With signed digital receipt</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* My Results Ring Card */}
                  <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
                        <Trophy className="h-4.5 w-4.5 text-amber-500" />
                        My Results
                      </h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab("results")}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent cursor-pointer"
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
                          <p className="text-lg font-bold text-foreground">
                            {pctList.length > 0 ? `${avgPct}%` : "—"}
                          </p>
                          <p className="text-[9px] text-ink-subtle">Overall Score</p>
                        </div>
                      </div>

                      <div className="flex-1 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-ink-muted">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Passed Exams
                          </span>
                          <span className="font-bold text-foreground">{passedCount}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-ink-muted">
                            <span className="h-2 w-2 rounded-full bg-accent" /> Total Attempts
                          </span>
                          <span className="font-bold text-foreground">{totalAttempts}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-ink-muted">
                            <span className="h-2 w-2 rounded-full bg-[#1e8e5a]" /> Average Score
                          </span>
                          <span className="font-bold text-foreground">
                            {pctList.length > 0 ? `${avgPct}%` : "Pending"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Verify Your Result Card with Real QR */}
                  <div className="rounded-2xl border border-[#e6f1ec] bg-gradient-to-br from-[#e6f1ec] to-[#dcebe4] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-ink">
                            <ShieldCheck className="h-4 w-4" />
                          </span>
                          Verify Your Result
                        </h3>
                        <p className="mt-2 text-xs text-ink-muted">
                          Check the authenticity of any result or hash chain using our public verifier.
                        </p>
                        <Link
                          href={firstVerifyCode ? `/verify/${encodeURIComponent(firstVerifyCode)}` : "/verify"}
                          className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3.5 py-1.5 text-xs font-semibold text-accent shadow-2xs hover:bg-accent-soft"
                        >
                          Verify Now <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                      <div className="shrink-0 rounded-xl bg-surface p-2 shadow-2xs">
                        <QRCodeSVG value={verifyTargetUrl} size={64} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === "exams" ? (
            <div className="mx-auto max-w-5xl space-y-6">
              <div>
                <h1 className="text-xl font-bold text-foreground">My Enrolled Examinations</h1>
                <p className="text-sm text-ink-subtle">
                  All available, upcoming, and completed examinations assigned to your account.
                </p>
              </div>
              {[
                { title: `Available Now (${available.length})`, items: available, type: "available" as const },
                { title: `Upcoming (${upcoming.length})`, items: upcoming, type: "upcoming" as const },
                { title: `Completed (${completed.length})`, items: completed, type: "completed" as const },
              ].map((sec) => (
                <div key={sec.title} className="rounded-2xl border border-border bg-surface p-5 shadow-2xs">
                  <h2 className="mb-3 text-base font-bold text-foreground">{sec.title}</h2>
                  {sec.items.length === 0 ? (
                    <p className="text-sm text-ink-subtle">None in this category.</p>
                  ) : (
                    <div className="space-y-3">
                      {sec.items.map((exam) => {
                        const att = exam.attempt;
                        const published = examResultsPublished(exam);
                        const code = att ? attemptVerifyCode(att) : "";
                        return (
                          <div
                            key={exam.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-subtle p-4"
                          >
                            <div>
                              <p className="font-semibold text-foreground">{exam.title}</p>
                              <p className="text-xs text-ink-subtle">
                                {fmtDate(examStartAt(exam))} – {fmtDate(examEndAt(exam))} ·{" "}
                                {examDurationMin(exam)} min · {examTotalMarks(exam)} marks
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {sec.type === "available" && (
                                att?.status === "IN_PROGRESS" ? (
                                  <Link href={`/exam/${att.id}`}>
                                    <Button variant="verified" size="sm">
                                      <Play className="h-3.5 w-3.5" /> Resume
                                    </Button>
                                  </Link>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setAckExam(exam);
                                      setAckChecked(false);
                                    }}
                                  >
                                    <Play className="h-3.5 w-3.5" /> Start Exam
                                  </Button>
                                )
                              )}
                              {sec.type === "upcoming" && <Badge tone="accent">Locked until start</Badge>}
                              {sec.type === "completed" && att && published && (
                                <Link href={`/results/${att.id}`}>
                                  <Button size="sm">View Result</Button>
                                </Link>
                              )}
                              {sec.type === "completed" && att && !published && (
                                <Badge tone="warning">Awaiting Publication</Badge>
                              )}
                              {code && (
                                <Link href={`/verify/${encodeURIComponent(code)}`}>
                                  <Button size="sm" variant="ghost">Verify</Button>
                                </Link>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : activeTab === "results" ? (
            <div className="mx-auto max-w-5xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-foreground">My Results &amp; Certificates</h1>
                  <p className="text-sm text-ink-subtle">
                    Download official QR-verifiable PDF reports or raise a dispute with full evidence timeline.
                  </p>
                </div>
                <Link href="/disputes">
                  <Button variant="secondary">Disputes &amp; Appeals</Button>
                </Link>
              </div>
              {completed.length === 0 ? (
                <EmptyState
                  title="No results yet"
                  description="Completed examinations will appear here once submitted."
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {completed.map((exam) => {
                    const att = exam.attempt;
                    const published = examResultsPublished(exam);
                    const code = att ? attemptVerifyCode(att) : "";
                    return (
                      <div key={exam.id} className="rounded-2xl border border-border bg-surface p-5 shadow-2xs space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-foreground">{exam.title}</h3>
                            <p className="text-xs text-ink-subtle">
                              Submitted {fmtDate(att?.submittedAt ?? examEndAt(exam))}
                            </p>
                          </div>
                          <Badge tone={published ? "verified" : "warning"}>
                            {published ? "Published" : "Pending"}
                          </Badge>
                        </div>
                        {att && published ? (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Link href={`/results/${att.id}`}>
                              <Button size="sm">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Open Result
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => api.reports.downloadAttemptPdf(att.id, code)}
                            >
                              <FileDown className="h-3.5 w-3.5" /> Download PDF
                            </Button>
                            {code && (
                              <Link href={`/verify/${encodeURIComponent(code)}`}>
                                <Button size="sm" variant="ghost">
                                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> {code}
                                </Button>
                              </Link>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-ink-subtle">
                            Waiting for examiner to publish grades.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeTab === "receipts" ? (
            <div className="mx-auto max-w-5xl space-y-5">
              <div>
                <h1 className="text-xl font-bold text-foreground">Cryptographic Receipts</h1>
                <p className="text-sm text-ink-subtle">
                  Every synced answer generates a server-signed HMAC receipt and links into your SHA-256 hash chain.
                </p>
              </div>
              {rawCompleted.filter((e) => e.attempt).length === 0 ? (
                <EmptyState
                  icon={<Receipt className="h-10 w-10" />}
                  title="No receipts yet"
                  description="Once you take an exam, every autosaved answer generates a verifiable receipt here."
                />
              ) : (
                <div className="space-y-3">
                  {rawCompleted
                    .filter((e) => e.attempt)
                    .map((exam) => {
                      const att = exam.attempt!;
                      const code = attemptVerifyCode(att);
                      return (
                        <div
                          key={exam.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-2xs"
                        >
                          <div>
                            <p className="font-semibold text-foreground">{exam.title}</p>
                            <p className="font-mono text-xs text-ink-subtle">
                              Attempt ID: {att.id} {code ? `· Code: ${code}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Link href={`/verify?attemptId=${encodeURIComponent(att.id)}`}>
                              <Button size="sm" variant="verified">
                                <ShieldCheck className="h-3.5 w-3.5" /> Verify Hash Chain
                              </Button>
                            </Link>
                            {examResultsPublished(exam) && (
                              <Link href={`/results/${att.id}`}>
                                <Button size="sm" variant="secondary">Inspect Receipts</Button>
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          ) : activeTab === "verify" ? (
            <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-7 text-center shadow-2xs space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e6f1ec] text-accent">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <h1 className="text-xl font-bold text-foreground">Public Cryptographic Verifier</h1>
              <p className="text-sm text-ink-muted">
                Independently audit your certificate verification code, SHA-256 answer hash chain, or exam seed commitment.
              </p>
              <div className="pt-2">
                <Link href="/verify">
                  <Button size="lg">
                    Open Public Verification Portal <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface p-6 shadow-2xs space-y-5">
              <div>
                <h1 className="text-xl font-bold text-foreground">Exam Workspace Preferences</h1>
                <p className="text-sm text-ink-subtle">
                  Saved to your account and applied automatically inside the exam workspace.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="st-font">Font Size</Label>
                  <Select
                    id="st-font"
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
                  <Label htmlFor="st-palette">Question Palette Position</Label>
                  <Select
                    id="st-palette"
                    value={user.prefs?.palettePosition ?? "right"}
                    onChange={(e) => {
                      updatePrefs({ palettePosition: e.target.value as WorkspacePrefs["palettePosition"] });
                      toast.success("Palette layout saved");
                    }}
                  >
                    <option value="right">Right Sidebar</option>
                    <option value="left">Left Sidebar</option>
                    <option value="bottom">Bottom Bar</option>
                  </Select>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
                  <input
                    type="checkbox"
                    checked={Boolean(user.prefs?.highContrast)}
                    onChange={(e) => {
                      updatePrefs({ highContrast: e.target.checked });
                      toast.success("Contrast preference saved");
                    }}
                    className="h-4 w-4 accent-[#1b4d3e]"
                  />
                  High Contrast Mode
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
                  <input
                    type="checkbox"
                    checked={Boolean(user.prefs?.splitLayout)}
                    onChange={(e) => {
                      updatePrefs({ splitLayout: e.target.checked });
                      toast.success("Split layout saved");
                    }}
                    className="h-4 w-4 accent-[#1b4d3e]"
                  />
                  Enable Split Scratchpad Layout
                </label>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Privacy-First Integrity Policy Modal */}
      {ackExam && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Exam Integrity Policy Acknowledgment"
        >
          <Card className="w-full max-w-lg">
            <CardHeader>
              <h3 className="text-base font-semibold">Before You Start: {ackExam.title}</h3>
              <p className="text-xs text-ink-muted">
                Duration: {examDurationMin(ackExam)} minutes · Server-authoritative timer
              </p>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-2 rounded-lg border border-border bg-surface-subtle p-3.5 text-xs text-ink-muted">
                <p className="flex items-start gap-2">
                  <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <span>
                    <strong>Offline Resilience:</strong> If your internet drops, keep answering. Your responses are stored locally in IndexedDB and synced with cryptographic receipts on reconnect.
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-verified" />
                  <span>
                    <strong>Privacy-First Indicators (Not Proof):</strong> We never use your webcam or screen recording. Fullscreen exits, tab switches, and paste attempts are logged solely as review indicators — never automated failure.
                  </span>
                </p>
              </div>

              {ackExam.instructions && (
                <div className="text-xs text-ink-muted">
                  <p className="mb-1 font-semibold text-foreground">Examiner Instructions:</p>
                  <p>{ackExam.instructions}</p>
                </div>
              )}

              <label className="flex cursor-pointer items-start gap-2.5 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={ackChecked}
                  onChange={(e) => setAckChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#1b4d3e]"
                />
                <span>
                  I understand the server deadline policy and acknowledge the privacy-first integrity indicators.
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" onClick={() => setAckExam(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={!ackChecked || startMut.isPending}
                  onClick={() => startMut.mutate(ackExam.id)}
                >
                  {startMut.isPending ? (
                    <>
                      <Spinner /> Starting…
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" /> Begin Exam
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
