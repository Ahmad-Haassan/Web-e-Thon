"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Home,
  LogOut,
  Menu,
  ShieldCheck,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  X,
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
import { Badge, Button, Spinner, ThemeToggleButton } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import type { UserRole } from "@/lib/client/api-types";

type AdminMenuTab = "dashboard" | "approvals" | "activities" | "analytics";

const DEFAULT_SYSTEM_EMAILS = new Set([
  "admin@exam.edu.pk",
  "examiner@exam.edu.pk",
  "examiner1@exam.edu.pk",
  "examiner2@exam.edu.pk",
  "student1@exam.edu.pk",
  "student2@exam.edu.pk",
  "student3@exam.edu.pk",
  "student4@exam.edu.pk",
  "student5@exam.edu.pk",
  "student6@exam.edu.pk",
  "student7@exam.edu.pk",
  "student8@exam.edu.pk",
  "student9@exam.edu.pk",
  "student10@exam.edu.pk",
  "ahmadd557125@gmail.com",
  "noman4arshad@gmail.com",
]);

function renderActivityIcon(kind: string) {
  switch (kind) {
    case "exam":
      return { dot: "bg-accent", box: "bg-accent-soft text-accent", Icon: ClipboardList };
    case "submit":
      return { dot: "bg-emerald-500", box: "bg-emerald-50 text-emerald-700", Icon: CheckCircle2 };
    case "user":
      return { dot: "bg-violet-500", box: "bg-violet-50 text-violet-700", Icon: UserPlus };
    case "publish":
      return { dot: "bg-teal-500", box: "bg-teal-50 text-teal-700", Icon: Trophy };
    case "dispute":
      return { dot: "bg-amber-500", box: "bg-amber-50 text-amber-700", Icon: AlertTriangle };
    default:
      return { dot: "bg-accent", box: "bg-accent-soft text-accent", Icon: ShieldCheck };
  }
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, loading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminMenuTab>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [ignoredPendingIds, setIgnoredPendingIds] = useState<string[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/admin");
    } else if (!user.active) {
      router.replace("/pending-approval");
    } else if (user.role !== "ADMIN") {
      router.replace(roleHomePath(user.role));
    }
  }, [user, loading, router]);

  const isAdmin = Boolean(user && user.active && user.role === "ADMIN");

  const overviewQuery = useQuery({
    queryKey: ["admin-overview", 30],
    queryFn: () => api.admin.overview(30),
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.admin.listUsers({}),
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const updateUserMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { role?: UserRole; active?: boolean } }) =>
      api.admin.updateUser(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

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

  const stats = overviewQuery.data?.stats;
  const activities = overviewQuery.data?.recentActivities ?? [];
  const series = overviewQuery.data?.analyticsSeries ?? [];

  // Pending Gmail/email registrations excluding default system accounts and ignored items
  const pendingApprovals = (usersQuery.data?.users ?? []).filter((u) => {
    const emailLower = (u.email ?? "").trim().toLowerCase();
    return !u.active && !DEFAULT_SYSTEM_EMAILS.has(emailLower) && !ignoredPendingIds.includes(u.id);
  });

  const adminDisplayName = user.name?.trim() || "Admin";

  const MENU_ITEMS: { id: AdminMenuTab; label: string; icon: typeof Home; badge?: number }[] = [
    { id: "dashboard", label: "Dashboard", icon: Home },
    {
      id: "approvals",
      label: "Pending Approvals",
      icon: UserCheck,
      badge: pendingApprovals.length,
    },
    { id: "activities", label: "Recent Activities", icon: Activity },
    { id: "analytics", label: "Student Analytics", icon: BarChart3 },
  ];

  const showActivities = activeTab === "dashboard" || activeTab === "activities";
  const showApprovals = activeTab === "dashboard" || activeTab === "approvals";
  const showAnalytics = activeTab === "dashboard" || activeTab === "analytics";

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Menu Bar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col portal-chrome text-[var(--portal-chrome-text)] transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--portal-chrome-border)] px-5 py-5">
          <Link href="/admin" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-[var(--portal-chrome-accent)]">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base font-bold leading-tight text-white">VeriExam</p>
              <p className="text-xs text-[var(--portal-chrome-muted)]">Admin Panel</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-1 text-[var(--portal-chrome-muted)] hover:bg-white/10 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-3 flex-1 space-y-1 px-3">
          {MENU_ITEMS.map(({ id, label, icon: Icon, badge }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setActiveTab(id);
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all cursor-pointer ${
                  active
                    ? "bg-[var(--portal-chrome-accent)] text-[#0a2620] font-semibold shadow-sm"
                    : "text-[var(--portal-chrome-text)]/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon
                    className={`h-4.5 w-4.5 ${
                      active ? "text-[#0a2620]" : "text-[var(--portal-chrome-muted)]"
                    }`}
                  />
                  <span>{label}</span>
                </span>
                {badge !== undefined && badge > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      active
                        ? "bg-[#0a2620]/15 text-[#0a2620]"
                        : "bg-amber-400/20 text-amber-300"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-[var(--portal-chrome-border)] p-4">
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 rounded-xl border border-white/15 bg-black/20 px-3.5 py-2.5 text-sm font-medium text-[var(--portal-chrome-text)] transition hover:bg-white/10 cursor-pointer"
          >
            <LogOut className="h-4 w-4 text-[var(--portal-chrome-muted)]" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Minimal Top Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <ThemeToggleButton showLabel />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 space-y-6">
          {/* Green Box Welcome Header */}
          <div className="rounded-2xl border border-[#1b4d3e]/30 bg-gradient-to-r from-[#113b32] to-[#1b4d3e] px-6 py-6 sm:px-8 sm:py-7 text-white shadow-sm">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Welcome! {adminDisplayName}
            </h1>
          </div>

          {/* Middle Row: Left = Recent Activities | Right = Pending Approvals */}
          {(showActivities || showApprovals) && (
            <div className="grid gap-6 lg:grid-cols-12">
              {showActivities && (
                <section
                  className={`rounded-2xl border border-border bg-surface p-5 shadow-2xs ${
                    showApprovals ? "lg:col-span-6" : "lg:col-span-12"
                  }`}
                >
                  <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                    <h2 className="text-base font-bold text-foreground">Recent Activities</h2>
                    <Badge tone="neutral">{activities.length} Events</Badge>
                  </div>

                  {overviewQuery.isLoading ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-subtle">
                      <Spinner /> Loading recent activities…
                    </div>
                  ) : activities.length === 0 ? (
                    <p className="py-12 text-center text-sm text-ink-subtle">
                      No recent activities recorded yet.
                    </p>
                  ) : (
                    <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
                      {activities.map((item) => {
                        const { dot, box, Icon } = renderActivityIcon(item.kind);
                        return (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface-subtle/50 px-3.5 py-2.5"
                          >
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
                            <span className="shrink-0 text-xs text-ink-subtle">
                              {formatDistanceToNow(new Date(item.at), { addSuffix: true })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {showApprovals && (
                <section
                  className={`rounded-2xl border border-warning/40 bg-surface p-5 shadow-2xs ${
                    showActivities ? "lg:col-span-6" : "lg:col-span-12"
                  }`}
                >
                  <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                    <div>
                      <h2 className="text-base font-bold text-foreground">Pending Approvals</h2>
                      <p className="text-xs text-ink-subtle">
                        New Gmail registrations &amp; examiner applications awaiting your approval
                      </p>
                    </div>
                    <Badge tone={pendingApprovals.length > 0 ? "warning" : "verified"}>
                      {pendingApprovals.length} Pending
                    </Badge>
                  </div>

                  {usersQuery.isLoading ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-subtle">
                      <Spinner /> Loading pending approvals…
                    </div>
                  ) : pendingApprovals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <CheckCircle2 className="mb-2 h-8 w-8 text-verified" />
                      <p className="text-sm font-medium text-foreground">All caught up!</p>
                      <p className="mt-1 text-xs text-ink-subtle">
                        No pending Gmail registrations or examiner applications right now.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                      {pendingApprovals.map((u) => (
                        <div
                          key={u.id}
                          className="rounded-xl border border-border bg-surface-subtle/60 p-3.5 space-y-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {u.name}
                            </p>
                            <p className="truncate font-mono text-xs text-ink-subtle">{u.email}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              disabled={updateUserMut.isPending}
                              onClick={() => {
                                updateUserMut.mutate({
                                  id: u.id,
                                  body: { role: "CANDIDATE", active: true },
                                });
                                toast.success(`Accepted ${u.email} as Student`);
                              }}
                            >
                              <UserCheck className="h-3.5 w-3.5" /> Accept Student
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={updateUserMut.isPending}
                              onClick={() => {
                                updateUserMut.mutate({
                                  id: u.id,
                                  body: { role: "EXAMINER", active: true },
                                });
                                toast.success(`Accepted ${u.email} as Examiner`);
                              }}
                            >
                              <UserCheck className="h-3.5 w-3.5" /> Accept Examiner
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={updateUserMut.isPending}
                              onClick={() => {
                                updateUserMut.mutate({
                                  id: u.id,
                                  body: { role: "ADMIN", active: true },
                                });
                                toast.success(`Accepted ${u.email} as Admin`);
                              }}
                            >
                              Accept Admin
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-danger hover:bg-danger-soft"
                              onClick={() => {
                                setIgnoredPendingIds((prev) => [...prev, u.id]);
                                toast.info(`Ignored ${u.email}`);
                              }}
                            >
                              <X className="h-3.5 w-3.5" /> Ignore
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* Bottom Box: Student Analytics Graph */}
          {showAnalytics && (
            <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-2xs">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Student Analytics (Last 30 Days)
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-subtle">
                    Total students, average student marks (%), and new students joined in the recent month
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
                        {overviewQuery.isLoading ? "…" : (stats?.totalStudents ?? 0)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-subtle px-3.5 py-2">
                    <Award className="h-4 w-4 text-verified" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-ink-subtle">
                        Average Marks
                      </p>
                      <p className="text-sm font-bold text-foreground">
                        {overviewQuery.isLoading ? "…" : `${stats?.avgMarksPct ?? 0}%`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-subtle px-3.5 py-2">
                    <UserPlus className="h-4 w-4 text-warning" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-ink-subtle">
                        Joined This Month
                      </p>
                      <p className="text-sm font-bold text-foreground">
                        {overviewQuery.isLoading ? "…" : (stats?.studentsJoinedLast30Days ?? 0)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "var(--ink-subtle)" }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      yAxisId="left"
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "var(--ink-subtle)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
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
                      yAxisId="left"
                      dataKey="joinedStudents"
                      name="Joined (Recent Month)"
                      fill="#d97706"
                      radius={[4, 4, 0, 0]}
                      barSize={14}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="totalStudents"
                      name="Total Students"
                      stroke="#113b32"
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="avgMarksPct"
                      name="Average Marks (%)"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
