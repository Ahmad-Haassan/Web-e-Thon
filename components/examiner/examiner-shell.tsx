"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  ChevronDown,
  ClipboardCheck,
  FileSpreadsheet,
  Home,
  LogOut,
  Menu,
  PlusCircle,
  Radio,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useAuth, roleHomePath } from "@/hooks/use-auth";
import { Badge, Spinner, ThemeToggleButton } from "@/components/ui/primitives";
import type {
  ExaminerIntegrityReport,
  ExaminerOverviewResponse,
} from "@/lib/client/api-types";
import type { ExaminerTab } from "./examiner-types";

interface ExaminerShellProps {
  activeTab: ExaminerTab;
  onSelectTab: (tab: ExaminerTab) => void;
  overview?: ExaminerOverviewResponse;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSelectExamForMonitor?: (examId: string) => void;
  onSelectExamForResults?: (examId: string) => void;
  onVerifyIntegrity: () => void;
  isVerifyingIntegrity?: boolean;
  integrityReport: ExaminerIntegrityReport | null;
  onDismissIntegrityReport: () => void;
  children: ReactNode;
}

const NAV_ITEMS: Array<{
  id: ExaminerTab;
  label: string;
  icon: typeof Home;
}> = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "create", label: "Create Exam", icon: PlusCircle },
  { id: "questions", label: "Question Bank", icon: BookOpen },
  { id: "exams", label: "My Exams", icon: CalendarCheck },
  { id: "monitor", label: "Live Monitoring", icon: Radio },
  { id: "results", label: "Results & Reports", icon: FileSpreadsheet },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

export function ExaminerShell({
  activeTab,
  onSelectTab,
  overview,
  searchQuery,
  onSearchChange,
  onSelectExamForMonitor,
  onSelectExamForResults,
  onVerifyIntegrity,
  isVerifyingIntegrity = false,
  integrityReport,
  onDismissIntegrityReport,
  children,
}: ExaminerShellProps) {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

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
    if (user.role !== "EXAMINER" && user.role !== "ADMIN") {
      router.replace(roleHomePath(user.role));
    }
  }, [user, loading, router]);

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !overview) return { exams: [], candidates: [] };
    return {
      exams: overview.exams
        .filter((e) => e.title.toLowerCase().includes(q))
        .slice(0, 5),
      candidates: overview.candidatesSummary
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.email.toLowerCase().includes(q) ||
            c.latestExamTitle.toLowerCase().includes(q)
        )
        .slice(0, 5),
    };
  }, [searchQuery, overview]);

  if (loading || !user || (user.role !== "EXAMINER" && user.role !== "ADMIN")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <Spinner className="h-5 w-5 text-accent" />
          Loading Examiner Panel…
        </div>
      </div>
    );
  }

  const liveBadgeCount = overview?.stats.liveBadgeCount ?? 0;
  const unreadNotifs = overview?.notifications.unreadCount ?? 0;
  const notifItems = overview?.notifications.items ?? [];
  const initial = (user.name?.[0] ?? "E").toUpperCase();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Dark Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col portal-chrome text-slate-200 transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/examiner" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-md">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base font-bold leading-tight text-white">VeriExam</p>
              <p className="text-xs text-slate-400">Examiner Panel</p>
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

        {/* Navigation */}
        <nav aria-label="Examiner navigation" className="mt-2 flex-1 space-y-1 px-3 overflow-y-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onSelectTab(id);
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all cursor-pointer ${
                  active
                    ? "bg-[var(--portal-chrome-accent)] text-[#0b2922] font-semibold shadow-sm"
                    : "text-slate-300 hover:bg-surface/5 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`h-4.5 w-4.5 shrink-0 ${active ? "text-[#0b2922]" : "text-[var(--portal-chrome-muted)]"}`}
                  />
                  <span className="truncate">{label}</span>
                </span>
                {id === "monitor" && liveBadgeCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
                    {liveBadgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Trusted & Verified Card + User Card */}
        <div className="space-y-3 p-3.5">
          <button
            type="button"
            disabled={isVerifyingIntegrity}
            onClick={onVerifyIntegrity}
            className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-left transition hover:border-emerald-400/40 hover:bg-black/35 cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                {isVerifyingIntegrity ? (
                  <Spinner className="h-4 w-4 text-emerald-400" />
                ) : (
                  <ShieldCheck className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white">Trusted &amp; Verified</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-300">
                  <span className="truncate">Tamper-Evident Records</span>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                </p>
                <p className="text-[10px] font-medium text-emerald-400">
                  {isVerifyingIntegrity ? "Verifying hash chains…" : "Enabled · Click to Audit"}
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectTab("settings");
              setMobileMenuOpen(false);
            }}
            className="flex w-full items-center justify-between gap-2.5 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-left transition hover:bg-black/35 cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                {initial}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">{user.name}</p>
                <p className="text-[11px] text-slate-400">
                  {user.role === "ADMIN" ? "Admin / Examiner" : "Examiner"}
                </p>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        </div>
      </aside>

      {/* Right Workspace */}
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
                value={searchQuery}
                onFocus={() => setShowSearchDropdown(true)}
                onBlur={() => setTimeout(() => setShowSearchDropdown(false), 180)}
                onChange={(e) => {
                  onSearchChange(e.target.value);
                  setShowSearchDropdown(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && activeTab === "dashboard" && searchQuery.trim()) {
                    setShowSearchDropdown(false);
                    onSelectTab("exams");
                  }
                }}
                placeholder="Search exams, candidates..."
                className="h-9 w-full rounded-xl border border-border bg-surface-subtle pl-10 pr-4 text-sm text-foreground placeholder:text-slate-400 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20"
              />

              {/* Instant Global Search Results Dropdown */}
              {showSearchDropdown && searchQuery.trim().length > 0 && (
                <div className="absolute left-0 right-0 mt-2 rounded-2xl border border-border bg-surface p-2 shadow-xl z-50">
                  {searchMatches.exams.length === 0 && searchMatches.candidates.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-ink-subtle">
                      No matching exams or candidates found for &ldquo;{searchQuery}&rdquo;.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {searchMatches.exams.length > 0 && (
                        <div>
                          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Examinations
                          </p>
                          {searchMatches.exams.map((ex) => (
                            <button
                              key={ex.id}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setShowSearchDropdown(false);
                                if (ex.lifecycle === "ONGOING" && onSelectExamForMonitor) {
                                  onSelectExamForMonitor(ex.id);
                                } else {
                                  router.push(`/examiner/exams/${ex.id}`);
                                }
                              }}
                              className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-surface-subtle cursor-pointer"
                            >
                              <span className="truncate font-semibold text-foreground">
                                {ex.title}
                              </span>
                              <Badge
                                tone={
                                  ex.lifecycle === "ONGOING"
                                    ? "verified"
                                    : ex.lifecycle === "DRAFT"
                                      ? "neutral"
                                      : "accent"
                                }
                              >
                                {ex.lifecycle}
                              </Badge>
                            </button>
                          ))}
                        </div>
                      )}

                      {searchMatches.candidates.length > 0 && (
                        <div>
                          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Candidates
                          </p>
                          {searchMatches.candidates.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setShowSearchDropdown(false);
                                if (onSelectExamForResults) {
                                  onSelectExamForResults(c.latestExamId);
                                } else {
                                  onSelectTab("results");
                                }
                              }}
                              className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-surface-subtle cursor-pointer"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-foreground">{c.name}</p>
                                <p className="truncate text-[11px] text-ink-subtle">
                                  {c.email} · {c.latestExamTitle}
                                </p>
                              </div>
                              {c.latestScorePct !== null && c.latestScorePct !== undefined ? (
                                <span className="shrink-0 font-mono font-semibold text-accent">
                                  {c.latestScorePct}%
                                </span>
                              ) : (
                                <span className="shrink-0 text-[11px] text-slate-400">
                                  {c.latestStatus ?? "Enrolled"}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggleButton />
            {/* Notifications Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowNotifications((v) => !v);
                  setShowProfileMenu(false);
                }}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-muted cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {unreadNotifs > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {unreadNotifs}
                  </span>
                )}
              </button>

              {showNotifications && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowNotifications(false)}
                  />
                  <div className="absolute right-0 z-50 mt-2 w-84 rounded-2xl border border-border bg-surface p-4 shadow-xl">
                    <div className="flex items-center justify-between border-b border-border pb-2.5">
                      <p className="text-sm font-semibold text-foreground">Examiner Alerts</p>
                      <span className="text-xs font-medium text-ink-subtle">
                        {unreadNotifs} needing attention
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          setShowNotifications(false);
                          onSelectTab("monitor");
                        }}
                        className="rounded-xl bg-rose-50 p-2 text-rose-700 hover:bg-rose-100 cursor-pointer"
                      >
                        <p className="text-sm font-bold">
                          {overview?.notifications.flaggedAttemptsCount ?? 0}
                        </p>
                        <p>Flagged</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNotifications(false);
                          onSelectTab("results");
                        }}
                        className="rounded-xl bg-amber-50 p-2 text-amber-700 hover:bg-amber-100 cursor-pointer"
                      >
                        <p className="text-sm font-bold">
                          {overview?.notifications.pendingManualGrades ?? 0}
                        </p>
                        <p>To Grade</p>
                      </button>
                      <Link
                        href="/disputes"
                        onClick={() => setShowNotifications(false)}
                        className="rounded-xl bg-accent-soft p-2 text-accent hover:bg-[#e6f1ec]"
                      >
                        <p className="text-sm font-bold">
                          {overview?.notifications.openDisputes ?? 0}
                        </p>
                        <p>Disputes</p>
                      </Link>
                    </div>

                    {notifItems.length > 0 ? (
                      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                        {notifItems.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => {
                              setShowNotifications(false);
                              if (n.kind === "dispute") {
                                router.push("/disputes");
                              } else if (n.kind === "flag" && n.examId && onSelectExamForMonitor) {
                                onSelectExamForMonitor(n.examId);
                              } else if (n.kind === "grading" && n.examId && onSelectExamForResults) {
                                onSelectExamForResults(n.examId);
                              }
                            }}
                            className="flex w-full items-start gap-2.5 rounded-xl bg-surface-subtle p-2.5 text-left text-xs hover:bg-surface-muted cursor-pointer"
                          >
                            <span
                              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                                n.kind === "flag"
                                  ? "bg-rose-100 text-rose-600"
                                  : n.kind === "grading"
                                    ? "bg-amber-100 text-amber-600"
                                    : "bg-[#e6f1ec] text-accent"
                              }`}
                            >
                              {n.kind === "flag" ? (
                                <Activity className="h-3.5 w-3.5" />
                              ) : n.kind === "grading" ? (
                                <ClipboardCheck className="h-3.5 w-3.5" />
                              ) : (
                                <AlertTriangle className="h-3.5 w-3.5" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-foreground">{n.title}</p>
                              <p className="truncate text-[11px] text-ink-subtle">{n.subtitle}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 py-3 text-center text-xs text-ink-subtle">
                        All caught up — no pending flags, grades, or disputes.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowProfileMenu((v) => !v);
                  setShowNotifications(false);
                }}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 hover:bg-surface-muted cursor-pointer"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1b4d3e] text-xs font-bold text-white">
                  {initial}
                </span>
                <span className="hidden text-sm font-medium text-ink-muted sm:inline max-w-36 truncate">
                  {user.name}
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>

              {showProfileMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className="absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-border bg-surface p-2 shadow-xl">
                    <div className="border-b border-border px-3 py-2.5">
                      <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                      <p className="truncate text-xs text-ink-subtle">{user.email}</p>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setShowProfileMenu(false);
                          onSelectTab("settings");
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface-subtle cursor-pointer"
                      >
                        <Settings className="h-4 w-4 text-slate-400" /> Examiner Settings
                      </button>
                      <Link
                        href="/disputes"
                        onClick={() => setShowProfileMenu(false)}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface-subtle"
                      >
                        <AlertTriangle className="h-4 w-4 text-slate-400" /> Disputes Queue
                      </Link>
                      <Link
                        href="/verify"
                        onClick={() => setShowProfileMenu(false)}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface-subtle"
                      >
                        <ShieldCheck className="h-4 w-4 text-emerald-500" /> Public Verifier
                      </Link>
                      {user.role === "ADMIN" && (
                        <Link
                          href="/admin"
                          onClick={() => setShowProfileMenu(false)}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-accent hover:bg-accent-soft"
                        >
                          <Users className="h-4 w-4" /> Admin Panel
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          setShowProfileMenu(false);
                          await signOut();
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        <LogOut className="h-4 w-4" /> Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-7">
          {/* Integrity Audit Banner */}
          {integrityReport && (
            <div
              className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 shadow-xs ${
                integrityReport.allValid
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-rose-200 bg-rose-50 text-rose-900"
              }`}
            >
              <div className="flex items-start gap-3">
                {integrityReport.allValid ? (
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                )}
                <div className="text-sm">
                  <p className="font-semibold">
                    {integrityReport.allValid
                      ? "Cryptographic Integrity Audit PASSED — All Records Verified Intact"
                      : `TAMPER ALERT — ${integrityReport.tamperedAttempts.length} broken hash chain(s) detected`}
                  </p>
                  <p className="mt-0.5 text-xs opacity-80">
                    Checked {integrityReport.examsChecked} exam(s), {integrityReport.attemptsChecked}{" "}
                    attempt(s), {integrityReport.answersChecked} chained answer(s),{" "}
                    {integrityReport.eventsChecked} event(s), and{" "}
                    {integrityReport.lockEventsChecked} lock event(s).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/verify"
                  className="rounded-lg bg-surface px-3 py-1.5 text-xs font-semibold text-ink-muted shadow-xs hover:bg-surface-subtle"
                >
                  Open Public Verifier
                </Link>
                <button
                  type="button"
                  onClick={onDismissIntegrityReport}
                  className="rounded-lg p-1.5 opacity-60 hover:opacity-100 cursor-pointer"
                  aria-label="Dismiss integrity report"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {children}
        </main>
      </div>
    </div>
  );
}
