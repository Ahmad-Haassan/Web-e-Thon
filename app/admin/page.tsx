"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  CloudDownload,
  ExternalLink,
  FileDown,
  FileText,
  Home,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from "lucide-react";
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
import { toast } from "sonner";
import { useAuth, roleHomePath } from "@/hooks/use-auth";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Label,
  Select,
  Spinner,
  ThemeToggleButton,
} from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import type { UserRole, WorkspacePrefs } from "@/lib/client/api-types";
import { createUserSchema } from "@/lib/shared/schemas";

type AdminTab =
  | "dashboard"
  | "users"
  | "exams"
  | "questions"
  | "analytics"
  | "logs"
  | "settings";

const SIDEBAR_ITEMS: { id: AdminTab; label: string; icon: typeof Home }[] = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "users", label: "User Management", icon: Users },
  { id: "exams", label: "Exam Management", icon: ClipboardList },
  { id: "questions", label: "Question Bank", icon: BookOpen },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "logs", label: "System Logs", icon: ScrollText },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function AdminDashboardPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, loading, signOut, updatePrefs } = useAuth();

  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [analyticsDays, setAnalyticsDays] = useState<7 | 30>(7);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // User Management state
  const [roleFilter, setRoleFilter] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("EXAMINER");
  const [invite, setInvite] = useState(false);

  // Question Bank filter state
  const [qDifficulty, setQDifficulty] = useState("");
  const [qType, setQType] = useState("");

  // System Logs filter state
  const [logEntity, setLogEntity] = useState("");

  // Live integrity audit modal state
  const [integrityReport, setIntegrityReport] = useState<Awaited<
    ReturnType<typeof api.admin.integrityCheck>
  > | null>(null);

  // Live clock for top date pill
  const [nowDisplay, setNowDisplay] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNowDisplay(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Auth / Role guard
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/admin");
      return;
    }
    if (user.role !== "ADMIN") {
      router.replace(roleHomePath(user.role));
    }
  }, [user, loading, router]);

  const isAdmin = Boolean(user && user.role === "ADMIN");

  // Queries
  const overviewQuery = useQuery({
    queryKey: ["admin-overview", analyticsDays],
    queryFn: () => api.admin.overview(analyticsDays),
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const usersQuery = useQuery({
    queryKey: ["admin-users", roleFilter, globalSearch],
    queryFn: () =>
      api.admin.listUsers({
        role: roleFilter || undefined,
        search: activeTab === "users" && globalSearch.trim() ? globalSearch.trim() : undefined,
      }),
    enabled: isAdmin && (activeTab === "users" || activeTab === "dashboard"),
  });

  const questionsQuery = useQuery({
    queryKey: ["admin-questions", qDifficulty, qType, globalSearch],
    queryFn: () =>
      api.questions.list({
        difficulty: qDifficulty || undefined,
        type: qType || undefined,
        search: activeTab === "questions" && globalSearch.trim() ? globalSearch.trim() : undefined,
      }),
    enabled: isAdmin && activeTab === "questions",
  });

  const logsQuery = useQuery({
    queryKey: ["admin-logs", logEntity],
    queryFn: () =>
      api.admin.auditLogs({
        entity: logEntity || undefined,
        limit: 100,
      }),
    enabled: isAdmin && activeTab === "logs",
  });

  // Mutations
  const createUserMut = useMutation({
    mutationFn: api.admin.createUser,
    onSuccess: (res) => {
      toast.success(`User ${res.user.email} created as ${res.user.role}`);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      setName("");
      setEmail("");
      setPassword("");
      setShowCreateUser(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateUserMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { role?: UserRole; active?: boolean } }) =>
      api.admin.updateUser(id, body),
    onSuccess: () => {
      toast.success("User updated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deactivateUserMut = useMutation({
    mutationFn: (id: string) => api.admin.deleteUser(id),
    onSuccess: () => {
      toast.success("User deactivated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const togglePublishResultsMut = useMutation({
    mutationFn: ({ id, resultsPublished }: { id: string; resultsPublished: boolean }) =>
      api.exams.update(id, { resultsPublished }),
    onSuccess: () => {
      toast.success("Exam result visibility updated");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const integrityMut = useMutation({
    mutationFn: () => api.admin.integrityCheck(),
    onSuccess: (res) => {
      setIntegrityReport(res);
      if (res.allValid) {
        toast.success(`All ${res.attemptsChecked} attempts & ${res.answersChecked} chained answers verified intact!`);
      } else {
        toast.error(`Tampering detected in ${res.tamperedAttempts.length} record(s)!`);
      }
      qc.invalidateQueries({ queryKey: ["admin-logs"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const exportMut = useMutation({
    mutationFn: (format: "json" | "csv") => api.admin.exportData(format),
    onSuccess: (_, format) => {
      toast.success(`Exported platform ${format.toUpperCase()} backup`);
      qc.invalidateQueries({ queryKey: ["admin-logs"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const finalizeMut = useMutation({
    mutationFn: () => api.admin.finalizeExpired(),
    onSuccess: (res) => {
      toast.success(`Expiry check complete — finalized ${res.finalizedCount} overdue attempt(s)`);
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: name.trim(),
      email: email.trim(),
      password: invite ? undefined : password || undefined,
      role,
      invite,
    };
    const parsed = createUserSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid user details");
      return;
    }
    createUserMut.mutate(parsed.data);
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  if (loading || !user || user.role !== "ADMIN") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <Spinner className="h-5 w-5 text-accent" />
          Loading Admin Panel…
        </div>
      </div>
    );
  }

  const overview = overviewQuery.data;
  const stats = overview?.stats;
  const activities = overview?.recentActivities ?? [];
  const series = overview?.analyticsSeries ?? [];
  const examBreakdown = (overview?.examBreakdown ?? []).filter((e) =>
    activeTab === "exams" && globalSearch.trim()
      ? e.title.toLowerCase().includes(globalSearch.trim().toLowerCase())
      : true
  );
  const unreadCount = overview?.notifications.unreadCount ?? 0;

  const filteredLogs = (logsQuery.data?.logs ?? []).filter((l) =>
    globalSearch.trim()
      ? `${l.action} ${l.entity} ${l.users?.email ?? ""} ${l.users?.name ?? ""}`
          .toLowerCase()
          .includes(globalSearch.trim().toLowerCase())
      : true
  );

  function renderActivityIcon(kind: string) {
    switch (kind) {
      case "exam":
        return {
          dot: "bg-accent",
          box: "bg-accent-soft text-accent",
          Icon: Plus,
        };
      case "submit":
        return {
          dot: "bg-emerald-500",
          box: "bg-emerald-50 text-emerald-600",
          Icon: CheckCircle2,
        };
      case "user":
        return {
          dot: "bg-violet-500",
          box: "bg-violet-50 text-violet-600",
          Icon: UserPlus,
        };
      case "publish":
        return {
          dot: "bg-teal-500",
          box: "bg-teal-50 text-teal-600",
          Icon: Trophy,
        };
      case "dispute":
        return {
          dot: "bg-amber-500",
          box: "bg-amber-50 text-amber-600",
          Icon: AlertTriangle,
        };
      default:
        return {
          dot: "bg-accent",
          box: "bg-accent-soft text-accent",
          Icon: ShieldCheck,
        };
    }
  }

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
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col portal-chrome text-slate-200 transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-md">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base font-bold leading-tight text-white">VeriExam</p>
              <p className="text-xs text-slate-400">Admin Panel</p>
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
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {SIDEBAR_ITEMS.map(({ id, label, icon: Icon }) => {
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
                    ? "bg-[var(--portal-chrome-accent)] text-[#241a0b] font-semibold shadow-sm"
                    : "text-slate-300 hover:bg-surface/5 hover:text-white"
                }`}
              >
                <Icon className={`h-4.5 w-4.5 ${active ? "text-[#241a0b]" : "text-[var(--portal-chrome-muted)]"}`} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom System Status Card */}
        <div className="p-4">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3.5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white">System Status</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-300">
                  <span className="truncate">All Systems Operational</span>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                </p>
              </div>
            </div>
          </div>
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
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && activeTab === "dashboard" && globalSearch.trim()) {
                    setActiveTab("users");
                  }
                }}
                placeholder="Search users, exams, questions, or logs..."
                className="h-9 w-full rounded-xl border border-border bg-surface-subtle pl-10 pr-4 text-sm text-foreground placeholder:text-slate-400 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
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
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-border bg-surface p-4 shadow-xl">
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <p className="text-sm font-semibold text-foreground">Platform Alerts</p>
                    <span className="text-xs text-ink-subtle">{unreadCount} active</span>
                  </div>
                  <div className="mt-3 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between rounded-xl bg-surface-subtle p-2.5">
                      <span className="text-ink-muted">Open Disputes</span>
                      <Link
                        href="/disputes"
                        onClick={() => setShowNotifications(false)}
                        className="font-semibold text-accent hover:underline"
                      >
                        {overview?.notifications.openDisputes ?? 0} view →
                      </Link>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-surface-subtle p-2.5">
                      <span className="text-ink-muted">Live In-Progress Attempts</span>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("exams");
                          setShowNotifications(false);
                        }}
                        className="font-semibold text-emerald-600 hover:underline cursor-pointer"
                      >
                        {overview?.notifications.inProgressAttempts ?? 0} monitor →
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Admin Profile Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowProfileMenu((v) => !v);
                  setShowNotifications(false);
                }}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 hover:bg-surface-muted cursor-pointer"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#312e81] text-xs font-bold text-white">
                  {(user.name?.[0] ?? "A").toUpperCase()}
                </span>
                <span className="hidden text-sm font-medium text-ink-muted sm:inline">
                  Admin
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-border bg-surface p-2 shadow-xl">
                  <div className="border-b border-border px-3 py-2.5">
                    <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                    <p className="text-xs text-ink-subtle truncate">{user.email}</p>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    <Link
                      href="/examiner"
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface-subtle"
                    >
                      <ClipboardList className="h-4 w-4 text-slate-400" /> Examiner Portal
                    </Link>
                    <Link
                      href="/disputes"
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface-subtle"
                    >
                      <AlertTriangle className="h-4 w-4 text-slate-400" /> Disputes Queue
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
          {/* Integrity Audit Banner if just run */}
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
                      ? "Cryptographic Integrity Audit PASSED — Zero Tampering Detected"
                      : `TAMPER ALERT — ${integrityReport.tamperedAttempts.length} broken hash chain(s) found`}
                  </p>
                  <p className="mt-0.5 text-xs opacity-80">
                    Checked {integrityReport.attemptsChecked} attempt(s),{" "}
                    {integrityReport.answersChecked} chained answer(s),{" "}
                    {integrityReport.eventsChecked} event(s), and{" "}
                    {integrityReport.examsChecked} exam checkpoint signature(s).
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
                  onClick={() => setIntegrityReport(null)}
                  className="rounded-lg p-1.5 opacity-60 hover:opacity-100 cursor-pointer"
                  aria-label="Dismiss integrity report"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ======================= 1. DASHBOARD TAB ======================= */}
          {activeTab === "dashboard" && (
            <div className="mx-auto max-w-6xl space-y-6">
              {/* Welcome Row */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    Welcome, Admin!
                  </h1>
                  <p className="mt-1 text-sm text-ink-subtle">
                    Here&apos;s what&apos;s happening on your examination platform today.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-medium text-ink-muted shadow-2xs">
                  <Calendar className="h-3.5 w-3.5 text-accent" />
                  <span>{format(nowDisplay, "MMM dd, yyyy • hh:mm a")}</span>
                </div>
              </div>

              {/* 4 KPI Stat Cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {/* Total Students */}
                <button
                  type="button"
                  onClick={() => setActiveTab("users")}
                  className="flex items-center gap-4 rounded-2xl border border-blue-100 bg-gradient-to-br from-[#eef4ff] to-[#f8faff] p-5 text-left shadow-2xs transition hover:shadow-md cursor-pointer"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-sm">
                    <Users className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold tracking-tight text-foreground">
                      {overviewQuery.isLoading ? "…" : (stats?.totalStudents ?? 0).toLocaleString()}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                      <span>Total Students</span>
                      <span className="font-semibold text-emerald-600">
                        {stats?.activeStudents ?? 0} active
                      </span>
                    </p>
                  </div>
                </button>

                {/* Total Exams */}
                <button
                  type="button"
                  onClick={() => setActiveTab("exams")}
                  className="flex items-center gap-4 rounded-2xl border border-emerald-100 bg-gradient-to-br from-[#ecfdf5] to-[#f7fefb] p-5 text-left shadow-2xs transition hover:shadow-md cursor-pointer"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                    <FileText className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold tracking-tight text-foreground">
                      {overviewQuery.isLoading ? "…" : (stats?.totalExams ?? 0).toLocaleString()}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                      <span>Total Exams</span>
                      <span className="font-semibold text-emerald-600">
                        {stats?.ongoingExams ?? 0} live
                      </span>
                    </p>
                  </div>
                </button>

                {/* Total Attempts */}
                <button
                  type="button"
                  onClick={() => setActiveTab("analytics")}
                  className="flex items-center gap-4 rounded-2xl border border-violet-100 bg-gradient-to-br from-[#f3f0ff] to-[#faf9ff] p-5 text-left shadow-2xs transition hover:shadow-md cursor-pointer"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                    <Check className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold tracking-tight text-foreground">
                      {overviewQuery.isLoading ? "…" : (stats?.totalAttempts ?? 0).toLocaleString()}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                      <span>Total Attempts</span>
                      <span className="font-semibold text-violet-600">
                        {stats?.gradedAttempts ?? 0} graded
                      </span>
                    </p>
                  </div>
                </button>

                {/* Platform Uptime / Integrity */}
                <button
                  type="button"
                  onClick={() => integrityMut.mutate()}
                  className="flex items-center gap-4 rounded-2xl border border-amber-100 bg-gradient-to-br from-[#fff7ed] to-[#fffcf7] p-5 text-left shadow-2xs transition hover:shadow-md cursor-pointer"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
                    <Activity className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold tracking-tight text-foreground">
                      {stats ? `${stats.platformHealthPct}%` : "99.9%"}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">Platform Uptime</p>
                  </div>
                </button>
              </div>

              {/* Middle Row: Recent Activities + Quick Actions */}
              <div className="grid gap-5 lg:grid-cols-5">
                {/* Recent Activities */}
                <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs lg:col-span-3">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-base font-bold text-foreground">Recent Activities</h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab("logs")}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent cursor-pointer"
                    >
                      View All <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {overviewQuery.isLoading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-subtle">
                      <Spinner /> Loading live activity feed…
                    </div>
                  ) : activities.length === 0 ? (
                    <p className="py-8 text-center text-sm text-ink-subtle">
                      No platform activity recorded yet.
                    </p>
                  ) : (
                    <div className="relative space-y-4">
                      {activities.slice(0, 5).map((item) => {
                        const { dot, box, Icon } = renderActivityIcon(item.kind);
                        return (
                          <div key={item.id} className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                              <span
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${box}`}
                              >
                                <Icon className="h-4 w-4" />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {item.title}
                                </p>
                                <p className="truncate text-xs text-ink-subtle">{item.subtitle}</p>
                              </div>
                            </div>
                            <span className="shrink-0 text-xs text-slate-400">
                              {formatDistanceToNow(new Date(item.at), { addSuffix: true })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs lg:col-span-2">
                  <h2 className="mb-4 text-base font-bold text-foreground">Quick Actions</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <Link
                      href="/examiner/exams/new"
                      className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#46351a] to-[#3730a3] px-4 py-6 text-center text-white shadow-md shadow-indigo-200 transition hover:brightness-110"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-surface/15">
                        <Plus className="h-5 w-5" />
                      </span>
                      <span className="text-xs font-semibold leading-tight">
                        Create
                        <br />
                        New Exam
                      </span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => setActiveTab("users")}
                      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-[#f5f7ff] px-4 py-6 text-center text-foreground transition hover:bg-accent-soft cursor-pointer"
                    >
                      <Users className="h-6 w-6 text-accent" />
                      <span className="text-xs font-semibold leading-tight">
                        Manage
                        <br />
                        Users
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("exams")}
                      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-[#f5f7ff] px-4 py-6 text-center text-foreground transition hover:bg-accent-soft cursor-pointer"
                    >
                      <FileText className="h-6 w-6 text-accent" />
                      <span className="text-xs font-semibold leading-tight">
                        View
                        <br />
                        Results
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("analytics")}
                      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-[#f5f7ff] px-4 py-6 text-center text-foreground transition hover:bg-accent-soft cursor-pointer"
                    >
                      <BarChart3 className="h-6 w-6 text-accent" />
                      <span className="text-xs font-semibold leading-tight">
                        Check
                        <br />
                        Analytics
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom Row: Platform Analytics Chart + System Tools */}
              <div className="grid gap-5 lg:grid-cols-5">
                {/* Platform Analytics */}
                <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs lg:col-span-3">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-foreground">Platform Analytics</h2>
                      <div className="mt-1 flex items-center gap-4 text-xs text-ink-subtle">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-accent" /> Exam Attempts
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Active Users
                        </span>
                      </div>
                    </div>

                    <select
                      aria-label="Analytics range"
                      value={analyticsDays}
                      onChange={(e) => setAnalyticsDays(Number(e.target.value) as 7 | 30)}
                      className="h-8 rounded-lg border border-border bg-surface-subtle px-2.5 text-xs font-medium text-ink-muted focus:border-accent focus:outline-none"
                    >
                      <option value={7}>Last 7 Days</option>
                      <option value={30}>Last 30 Days</option>
                    </select>
                  </div>

                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="attemptsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#46351a" stopOpacity={0.22} />
                            <stop offset="95%" stopColor="#46351a" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="usersGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: "#64748b" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 11, fill: "#64748b" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "12px",
                            borderColor: "#e2e8f0",
                            fontSize: "12px",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="examAttempts"
                          name="Exam Attempts"
                          stroke="#46351a"
                          strokeWidth={2.5}
                          fill="url(#attemptsGrad)"
                          dot={{ r: 3, fill: "#ffffff", stroke: "#46351a", strokeWidth: 2 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="activeUsers"
                          name="Active Users"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          fill="url(#usersGrad)"
                          dot={{ r: 3, fill: "#ffffff", stroke: "#10b981", strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* System Tools */}
                <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs lg:col-span-2">
                  <h2 className="mb-4 text-base font-bold text-foreground">System Tools</h2>
                  <div className="space-y-2.5">
                    <button
                      type="button"
                      disabled={integrityMut.isPending}
                      onClick={() => integrityMut.mutate()}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface-subtle p-3.5 text-left transition hover:border-border-strong hover:bg-accent-soft/50 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-accent">
                          {integrityMut.isPending ? (
                            <Spinner className="h-4 w-4 text-accent" />
                          ) : (
                            <ShieldCheck className="h-5 w-5" />
                          )}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Verify Records Integrity
                          </p>
                          <p className="text-xs text-ink-subtle">
                            Check hash chain and audit logs
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>

                    <button
                      type="button"
                      disabled={exportMut.isPending}
                      onClick={() => exportMut.mutate("json")}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface-subtle p-3.5 text-left transition hover:border-border-strong hover:bg-accent-soft/50 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                          {exportMut.isPending ? (
                            <Spinner className="h-4 w-4 text-sky-600" />
                          ) : (
                            <CloudDownload className="h-5 w-5" />
                          )}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Export Data</p>
                          <p className="text-xs text-ink-subtle">Download reports and backups</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("settings")}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface-subtle p-3.5 text-left transition hover:border-border-strong hover:bg-accent-soft/50 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-accent">
                          <Settings className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Configure Settings
                          </p>
                          <p className="text-xs text-ink-subtle">Manage platform settings</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================= 2. USER MANAGEMENT TAB ======================= */}
          {activeTab === "users" && (
            <div className="mx-auto max-w-6xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-foreground">User Management</h1>
                  <p className="text-sm text-ink-subtle">
                    Provision Admins, Examiners, and Candidates with server-enforced RBAC roles.
                  </p>
                </div>
                <Button onClick={() => setShowCreateUser((v) => !v)}>
                  <UserPlus className="h-4 w-4" />
                  {showCreateUser ? "Close Form" : "Add / Invite User"}
                </Button>
              </div>

              {showCreateUser && (
                <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs">
                  <h2 className="mb-4 text-sm font-bold text-foreground">
                    Create or Invite Institutional Account
                  </h2>
                  <form onSubmit={handleCreateUser} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <Label htmlFor="admin-new-name">Full Name</Label>
                      <Input
                        id="admin-new-name"
                        required
                        placeholder="Dr. Salman Tariq"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="admin-new-email">Email</Label>
                      <Input
                        id="admin-new-email"
                        type="email"
                        required
                        placeholder="salman@university.edu.pk"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="admin-new-role">Role</Label>
                      <Select
                        id="admin-new-role"
                        value={role}
                        onChange={(e) => setRole(e.target.value as UserRole)}
                      >
                        <option value="EXAMINER">EXAMINER</option>
                        <option value="CANDIDATE">CANDIDATE</option>
                        <option value="ADMIN">ADMIN</option>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="admin-new-pass">
                        Password {invite ? "(Optional)" : ""}
                      </Label>
                      <Input
                        id="admin-new-pass"
                        type="password"
                        disabled={invite}
                        minLength={8}
                        placeholder={invite ? "Email invite sent" : "Min 8 characters"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 lg:col-span-4">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
                        <input
                          type="checkbox"
                          checked={invite}
                          onChange={(e) => setInvite(e.target.checked)}
                          className="h-4 w-4 rounded accent-indigo-600"
                        />
                        Send Supabase invite email instead of setting password now
                      </label>
                      <div className="flex gap-2">
                        <Button type="button" variant="secondary" onClick={() => setShowCreateUser(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createUserMut.isPending}>
                          {createUserMut.isPending ? <Spinner /> : "Create User"}
                        </Button>
                      </div>
                    </div>
                  </form>
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                  <p className="text-sm font-semibold text-ink-muted">
                    {(usersQuery.data?.users ?? []).length} account(s)
                  </p>
                  <Select
                    aria-label="Filter by role"
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="w-44"
                  >
                    <option value="">All Roles</option>
                    <option value="ADMIN">Admins</option>
                    <option value="EXAMINER">Examiners</option>
                    <option value="CANDIDATE">Candidates</option>
                  </Select>
                </div>

                {usersQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-subtle">
                    <Spinner /> Loading users…
                  </div>
                ) : (usersQuery.data?.users ?? []).length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      title="No matching users"
                      description="Adjust your search or role filter, or create a new account above."
                    />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border bg-surface-subtle text-xs uppercase text-ink-subtle">
                        <tr>
                          <th className="px-5 py-3">User</th>
                          <th className="px-5 py-3">Role</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(usersQuery.data?.users ?? []).map((u) => (
                          <tr key={u.id} className="hover:bg-surface-subtle">
                            <td className="px-5 py-3.5">
                              <p className="font-semibold text-foreground">{u.name}</p>
                              <p className="text-xs text-ink-subtle">{u.email}</p>
                            </td>
                            <td className="px-5 py-3.5">
                              <Select
                                aria-label={`Role for ${u.email}`}
                                value={u.role}
                                onChange={(e) =>
                                  updateUserMut.mutate({
                                    id: u.id,
                                    body: { role: e.target.value as UserRole },
                                  })
                                }
                                className="h-8 w-36 text-xs"
                              >
                                <option value="ADMIN">ADMIN</option>
                                <option value="EXAMINER">EXAMINER</option>
                                <option value="CANDIDATE">CANDIDATE</option>
                              </Select>
                            </td>
                            <td className="px-5 py-3.5">
                              <Badge tone={u.active ? "verified" : "danger"}>
                                {u.active ? "Active" : "Deactivated"}
                              </Badge>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              {u.active ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-rose-600"
                                  disabled={u.id === user.id}
                                  onClick={() => deactivateUserMut.mutate(u.id)}
                                >
                                  <UserX className="h-3.5 w-3.5" /> Deactivate
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    updateUserMut.mutate({ id: u.id, body: { active: true } })
                                  }
                                >
                                  <UserCheck className="h-3.5 w-3.5" /> Reactivate
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================= 3. EXAM MANAGEMENT TAB ======================= */}
          {activeTab === "exams" && (
            <div className="mx-auto max-w-6xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-foreground">Exam Management &amp; Results</h1>
                  <p className="text-sm text-ink-subtle">
                    Oversee every examination, publish results, monitor live attempts, and export audit PDFs.
                  </p>
                </div>
                <Link href="/examiner/exams/new">
                  <Button>
                    <Plus className="h-4 w-4" /> Create New Exam
                  </Button>
                </Link>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-2xs">
                {overviewQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-subtle">
                    <Spinner /> Loading exams…
                  </div>
                ) : examBreakdown.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      title="No exams found"
                      description="Create your first exam to start enrolling candidates."
                    />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border bg-surface-subtle text-xs uppercase text-ink-subtle">
                        <tr>
                          <th className="px-5 py-3">Examination</th>
                          <th className="px-5 py-3">Lifecycle</th>
                          <th className="px-5 py-3">Enrolled / Submitted</th>
                          <th className="px-5 py-3">Avg / Pass Rate</th>
                          <th className="px-5 py-3">Results</th>
                          <th className="px-5 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {examBreakdown.map((ex) => (
                          <tr key={ex.id} className="hover:bg-surface-subtle">
                            <td className="px-5 py-3.5">
                              <p className="font-semibold text-foreground">{ex.title}</p>
                              <p className="text-xs text-ink-subtle">
                                {format(new Date(ex.startAt), "MMM d, HH:mm")} –{" "}
                                {format(new Date(ex.endAt), "MMM d, HH:mm")}
                              </p>
                            </td>
                            <td className="px-5 py-3.5">
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
                            </td>
                            <td className="px-5 py-3.5 font-mono text-xs text-ink-muted">
                              {ex.enrolledCount} enrolled · {ex.submittedCount} submitted
                            </td>
                            <td className="px-5 py-3.5 font-mono text-xs text-ink-muted">
                              {ex.submittedCount > 0 ? `${ex.avgPct}% avg · ${ex.passRate}% pass` : "—"}
                            </td>
                            <td className="px-5 py-3.5">
                              <Button
                                size="sm"
                                variant={ex.resultsPublished ? "secondary" : "verified"}
                                disabled={togglePublishResultsMut.isPending}
                                onClick={() =>
                                  togglePublishResultsMut.mutate({
                                    id: ex.id,
                                    resultsPublished: !ex.resultsPublished,
                                  })
                                }
                              >
                                {ex.resultsPublished ? "Published" : "Publish"}
                              </Button>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <Link href={`/examiner/exams/${ex.id}`}>
                                  <Button size="sm" variant="secondary">
                                    Manage <ExternalLink className="h-3.5 w-3.5" />
                                  </Button>
                                </Link>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => api.reports.downloadExamPdf(ex.id, ex.title)}
                                  title="Download Summary PDF"
                                >
                                  <FileDown className="h-4 w-4 text-accent" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================= 4. QUESTION BANK TAB ======================= */}
          {activeTab === "questions" && (
            <div className="mx-auto max-w-6xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-foreground">Question Bank</h1>
                  <p className="text-sm text-ink-subtle">
                    All institutional questions (answer keys remain isolated in server-only RLS table).
                  </p>
                </div>
                <Link href="/examiner/questions">
                  <Button>
                    <Plus className="h-4 w-4" /> Open Full Editor &amp; Bulk CSV Import
                  </Button>
                </Link>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                  <p className="text-sm font-semibold text-ink-muted">
                    {(questionsQuery.data?.questions ?? []).length} question(s)
                  </p>
                  <div className="flex items-center gap-2">
                    <Select
                      aria-label="Question type"
                      value={qType}
                      onChange={(e) => setQType(e.target.value)}
                      className="w-36"
                    >
                      <option value="">All Types</option>
                      <option value="SINGLE">SINGLE</option>
                      <option value="MULTI">MULTI</option>
                      <option value="WRITTEN">WRITTEN</option>
                    </Select>
                    <Select
                      aria-label="Question difficulty"
                      value={qDifficulty}
                      onChange={(e) => setQDifficulty(e.target.value)}
                      className="w-36"
                    >
                      <option value="">All Difficulties</option>
                      <option value="1">Easy (1)</option>
                      <option value="2">Medium (2)</option>
                      <option value="3">Hard (3)</option>
                    </Select>
                  </div>
                </div>

                {questionsQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-subtle">
                    <Spinner /> Loading questions…
                  </div>
                ) : (questionsQuery.data?.questions ?? []).length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      title="No questions match"
                      description="Clear filters or create new questions in the full Question Bank editor."
                    />
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {(questionsQuery.data?.questions ?? []).map((q) => (
                      <div key={q.id} className="flex items-start justify-between gap-4 p-4 hover:bg-surface-subtle">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{q.text}</p>
                          <p className="mt-1 text-xs text-ink-subtle">
                            {q.category?.name ?? "Uncategorized"} · {q.options?.length ?? 0} option(s)
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Badge tone="accent">{q.type}</Badge>
                          <Badge tone={q.difficulty === 3 ? "danger" : q.difficulty === 2 ? "warning" : "verified"}>
                            L{q.difficulty}
                          </Badge>
                          <Badge tone="neutral">{q.marks} pts</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================= 5. ANALYTICS TAB ======================= */}
          {activeTab === "analytics" && (
            <div className="mx-auto max-w-6xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-foreground">Platform Analytics</h1>
                  <p className="text-sm text-ink-subtle">
                    Live submission velocity, user engagement, and per-exam score &amp; pass-rate metrics.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={analyticsDays}
                    onChange={(e) => setAnalyticsDays(Number(e.target.value) as 7 | 30)}
                    className="h-9 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-ink-muted"
                  >
                    <option value={7}>Last 7 Days</option>
                    <option value={30}>Last 30 Days</option>
                  </select>
                  <Button variant="secondary" onClick={() => exportMut.mutate("csv")}>
                    <FileDown className="h-4 w-4" /> Export CSV Report
                  </Button>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs">
                  <h2 className="mb-4 text-sm font-bold text-foreground">
                    Daily Attempts &amp; Active Users
                  </h2>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                        <Tooltip />
                        <Area
                          type="monotone"
                          dataKey="examAttempts"
                          name="Exam Attempts"
                          stroke="#46351a"
                          fill="#dbeafe"
                          strokeWidth={2}
                        />
                        <Area
                          type="monotone"
                          dataKey="activeUsers"
                          name="Active Users"
                          stroke="#10b981"
                          fill="#d1fae5"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs">
                  <h2 className="mb-4 text-sm font-bold text-foreground">
                    Exam Performance (Avg % vs Pass Rate %)
                  </h2>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={examBreakdown.map((e) => ({
                          name: e.title.length > 18 ? e.title.slice(0, 16) + "…" : e.title,
                          avgPct: e.avgPct,
                          passRate: e.passRate,
                        }))}
                        margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                        <Tooltip />
                        <Bar dataKey="avgPct" name="Avg Score %" fill="#46351a" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="passRate" name="Pass Rate %" fill="#10b981" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================= 6. SYSTEM LOGS TAB ======================= */}
          {activeTab === "logs" && (
            <div className="mx-auto max-w-6xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-foreground">System Audit Logs</h1>
                  <p className="text-sm text-ink-subtle">
                    Immutable trail of administrative actions, exam submissions, emergency unlocks, and disputes.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    aria-label="Filter logs by entity"
                    value={logEntity}
                    onChange={(e) => setLogEntity(e.target.value)}
                    className="w-40"
                  >
                    <option value="">All Entities</option>
                    <option value="users">Users</option>
                    <option value="exams">Exams</option>
                    <option value="attempts">Attempts</option>
                    <option value="disputes">Disputes</option>
                    <option value="unlock_codes">Unlock Codes</option>
                    <option value="system">System</option>
                  </Select>
                  <Button variant="secondary" onClick={() => logsQuery.refetch()}>
                    <RefreshCw className="h-4 w-4" /> Refresh
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-2xs">
                {logsQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-subtle">
                    <Spinner /> Loading audit logs…
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      title="No audit events found"
                      description="Run an integrity check or perform an admin action to see entries here."
                    />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-border bg-surface-subtle uppercase text-ink-subtle">
                        <tr>
                          <th className="px-4 py-3">Timestamp</th>
                          <th className="px-4 py-3">Action</th>
                          <th className="px-4 py-3">Actor</th>
                          <th className="px-4 py-3">Entity</th>
                          <th className="px-4 py-3">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-surface-subtle">
                            <td className="whitespace-nowrap px-4 py-3 font-mono text-ink-subtle">
                              {format(new Date(log.at), "MMM d, HH:mm:ss")}
                            </td>
                            <td className="px-4 py-3">
                              <Badge tone="accent">{log.action}</Badge>
                            </td>
                            <td className="px-4 py-3 text-ink-muted">
                              {log.users?.email ?? "System"}
                            </td>
                            <td className="px-4 py-3 font-mono text-ink-muted">
                              {log.entity}
                              {log.entity_id ? `:${log.entity_id.slice(0, 8)}` : ""}
                            </td>
                            <td className="max-w-xs truncate px-4 py-3 font-mono text-[11px] text-ink-subtle">
                              {log.after ? JSON.stringify(log.after) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================= 7. SETTINGS TAB ======================= */}
          {activeTab === "settings" && (
            <div className="mx-auto max-w-4xl space-y-5">
              <div>
                <h1 className="text-xl font-bold text-foreground">Platform Settings &amp; Maintenance</h1>
                <p className="text-sm text-ink-subtle">
                  Run system maintenance jobs, export backups, verify hash chains, and configure display preferences.
                </p>
              </div>

              {/* Cryptographic & Cron Maintenance */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="h-5 w-5 text-accent" />
                    <h2 className="text-sm font-bold text-foreground">Cryptographic Integrity Audit</h2>
                  </div>
                  <p className="mt-1.5 text-xs text-ink-subtle">
                    Recompute SHA-256 chains across every answer, event, lock event, and exam checkpoint signature.
                  </p>
                  <Button
                    className="mt-4"
                    disabled={integrityMut.isPending}
                    onClick={() => integrityMut.mutate()}
                  >
                    {integrityMut.isPending ? <Spinner /> : "Run Full Integrity Audit"}
                  </Button>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <Clock className="h-5 w-5 text-emerald-600" />
                    <h2 className="text-sm font-bold text-foreground">Expiry Finalizer Job</h2>
                  </div>
                  <p className="mt-1.5 text-xs text-ink-subtle">
                    Immediately expire any overdue IN_PROGRESS attempts past their deadline + grace window and auto-grade them.
                  </p>
                  <Button
                    variant="secondary"
                    className="mt-4"
                    disabled={finalizeMut.isPending}
                    onClick={() => finalizeMut.mutate()}
                  >
                    {finalizeMut.isPending ? <Spinner /> : "Run Expiry Finalizer Now"}
                  </Button>
                </div>
              </div>

              {/* Export & Backup */}
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs">
                <h2 className="text-sm font-bold text-foreground">Data Export &amp; Backups</h2>
                <p className="mt-1 text-xs text-ink-subtle">
                  Exports exclude answer keys and secret seeds to preserve examination confidentiality.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button variant="secondary" disabled={exportMut.isPending} onClick={() => exportMut.mutate("json")}>
                    <CloudDownload className="h-4 w-4" /> Download Full JSON Backup
                  </Button>
                  <Button variant="secondary" disabled={exportMut.isPending} onClick={() => exportMut.mutate("csv")}>
                    <FileDown className="h-4 w-4" /> Download Results CSV
                  </Button>
                </div>
              </div>

              {/* Workspace Display Preferences */}
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs">
                <h2 className="text-sm font-bold text-foreground">Admin Display Preferences</h2>
                <p className="mt-1 text-xs text-ink-subtle">
                  Saved directly to your account via <code className="font-mono">/api/me/prefs</code>.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="pref-font">Font Size</Label>
                    <Select
                      id="pref-font"
                      value={user.prefs?.fontSize ?? "md"}
                      onChange={(e) => {
                        updatePrefs({ fontSize: e.target.value as WorkspacePrefs["fontSize"] });
                        toast.success("Font preference saved");
                      }}
                    >
                      <option value="sm">Small</option>
                      <option value="md">Medium (Default)</option>
                      <option value="lg">Large</option>
                      <option value="xl">Extra Large</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="pref-theme">Theme</Label>
                    <Select
                      id="pref-theme"
                      value={user.prefs?.theme ?? "light"}
                      onChange={(e) => {
                        updatePrefs({ theme: e.target.value as WorkspacePrefs["theme"] });
                        toast.success("Theme preference saved");
                      }}
                    >
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                      <option value="system">System</option>
                    </Select>
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
                      <input
                        type="checkbox"
                        checked={Boolean(user.prefs?.highContrast)}
                        onChange={(e) => {
                          updatePrefs({ highContrast: e.target.checked });
                          toast.success("Contrast preference saved");
                        }}
                        className="h-4 w-4 rounded accent-indigo-600"
                      />
                      High Contrast Mode
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
