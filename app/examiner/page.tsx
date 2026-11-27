"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Activity,
  BarChart3,
  BookOpen,
  Calendar,
  Clock,
  FileDown,
  FileWarning,
  GraduationCap,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  User as UserIcon,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Input,
  Skeleton,
} from "@/components/ui/primitives";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/client/api";
import {
  computeClientLifecycle,
  examDurationMin,
  examEndAt,
  examResultsPublished,
  examStartAt,
  examTotalMarks,
  type ComputedExamLifecycle,
} from "@/lib/client/api-types";

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

function safeFormatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, "MMM d, yyyy · HH:mm");
}

function PublishRateGauge({ percent, label }: { percent: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex h-20 w-20 items-center justify-center shrink-0">
        <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80" aria-hidden="true">
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke="rgba(251, 233, 199, 0.22)"
            strokeWidth="6"
          />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke="#f3c874"
            strokeWidth="6"
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="butt"
          />
        </svg>
        <span className="absolute font-mono text-base font-bold text-[#fbe9c7] tabular-nums">
          {clamped}%
        </span>
      </div>
      <div className="text-left">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#fbe9c7]/70">
          {label}
        </p>
        <p className="mt-0.5 text-xs text-[#fbe9c7]/90">
          Verified &amp; published
        </p>
      </div>
    </div>
  );
}

export default function ExaminerDashboardPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedClass, setSelectedClass] = useState<string | null>(null);

  const examsQuery = useQuery({
    queryKey: ["examiner-exams"],
    queryFn: () => api.exams.list(),
  });

  const classesQuery = useQuery({
    queryKey: ["registered-classes"],
    queryFn: () => api.classes.list(),
  });

  const exams = useMemo(() => examsQuery.data?.exams ?? [], [examsQuery.data?.exams]);
  const classes = classesQuery.data?.classes ?? [];
  const ongoingCount = useMemo(
    () => exams.filter((e) => computeClientLifecycle(e) === "ONGOING").length,
    [exams]
  );
  const publishedResultsCount = useMemo(
    () => exams.filter((e) => examResultsPublished(e)).length,
    [exams]
  );
  const totalStudentsCount = useMemo(
    () => classes.reduce((sum, c) => sum + c.totalStudents, 0),
    [classes]
  );
  const publishRate = exams.length > 0 ? (publishedResultsCount / exams.length) * 100 : 0;

  const filteredExams = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exams.filter((e) => {
      const cls = (e.class_name ?? e.className ?? "").toLowerCase();
      if (selectedClass && cls !== selectedClass.toLowerCase()) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (e.category ?? "").toLowerCase().includes(q) ||
        cls.includes(q)
      );
    });
  }, [exams, search, selectedClass]);

  const todayLabel = format(new Date(), "EEEE, MMMM d, yyyy");

  return (
    <AppShell
      allowedRoles={["ADMIN", "EXAMINER"]}
      title="Examinations"
      subtitle="Manage assigned exams, browse registered classes, monitor live sessions, and review verifiable marks."
      actions={
        <>
          <Link href="/examiner/questions">
            <Button variant="secondary" size="sm">
              <BookOpen className="h-4 w-4" strokeWidth={1.6} /> Question bank
            </Button>
          </Link>
          <Link href="/examiner/exams/new">
            <Button size="sm">
              <Plus className="h-4 w-4" strokeWidth={1.75} /> Create exam
            </Button>
          </Link>
        </>
      }
    >
      {/* NIIT AMS-style Heritage Hero Banner */}
      <section className="portal-chrome mb-6 rounded-sm border border-[#f3c874]/25 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#f3c874]">
              {todayLabel} · Examiner Workspace
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-wide text-[#fbe9c7]">
              Welcome back, {user?.name?.toUpperCase() ?? "EXAMINER"}!
            </h2>
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fbe9c7]/25 bg-[#fbe9c7]/10 px-3 py-1 font-mono text-[#fbe9c7] tabular-nums">
                {exams.length} Exams
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f3c874]/40 bg-[#f3c874]/15 px-3 py-1 font-mono text-[#f3c874] tabular-nums">
                <Activity className="h-3.5 w-3.5" />
                {ongoingCount} Live Now
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fbe9c7]/25 bg-[#fbe9c7]/10 px-3 py-1 font-mono text-[#fbe9c7] tabular-nums">
                {classes.length} Classes · {totalStudentsCount} Students
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-[#fbe9c7]/15 pt-4 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
            <PublishRateGauge percent={publishRate} label="Results Published" />
          </div>
        </div>
      </section>

      {/* NIIT AMS Quick Links Tile Row */}
      <section aria-label="Quick links" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          {
            href: "/examiner/exams/new",
            label: "Create Exam",
            meta: "Schedule & rules",
            icon: Plus,
          },
          {
            href: "/examiner/questions",
            label: "Question Bank",
            meta: "MCQ & descriptive",
            icon: BookOpen,
          },
          {
            href: "/disputes",
            label: "Disputes Queue",
            meta: "Evidence review",
            icon: FileWarning,
          },
          {
            href: "/verify",
            label: "Public Verify",
            meta: "Audit hash chain",
            icon: ShieldCheck,
          },
          {
            href: "/profile",
            label: "My Profile",
            meta: "Account settings",
            icon: UserIcon,
          },
        ].map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.href}
              href={tile.href}
              className="group flex items-center gap-3 rounded-sm border border-border bg-surface p-3.5 transition-[border-color,background-color] duration-150 hover:border-accent hover:bg-surface-subtle surface-card"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-border bg-surface-subtle text-accent group-hover:bg-accent group-hover:text-accent-ink transition-colors">
                <Icon className="h-4 w-4" strokeWidth={1.7} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase tracking-[0.04em] text-foreground">
                  {tile.label}
                </p>
                <p className="truncate text-[11px] text-ink-muted">{tile.meta}</p>
              </div>
            </Link>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left: Searchable Assigned Exams */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[220px]">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
                strokeWidth={1.6}
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search exams, category, or class"
                className="pl-9"
              />
            </div>
            {selectedClass && (
              <Button size="sm" variant="secondary" onClick={() => setSelectedClass(null)}>
                Class {selectedClass} ✕
              </Button>
            )}
          </div>

          {examsQuery.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-52 w-full" />
              <Skeleton className="h-52 w-full" />
            </div>
          ) : examsQuery.error ? (
            <Card>
              <CardContent className="text-sm text-danger">
                {(examsQuery.error as Error).message}
              </CardContent>
            </Card>
          ) : filteredExams.length === 0 ? (
            <EmptyState
              icon={<Calendar className="h-10 w-10" />}
              title={exams.length === 0 ? "No exams created yet" : "No exams match your filter"}
              description={
                exams.length === 0
                  ? "Build your first failure-resilient examination with rules, class assignment, and live monitoring."
                  : "Clear the search or class filter to view all assigned exams."
              }
              action={
                exams.length === 0 ? (
                  <Link href="/examiner/exams/new">
                    <Button>
                      <Plus className="h-4 w-4" /> Create Exam
                    </Button>
                  </Link>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch("");
                      setSelectedClass(null);
                    }}
                  >
                    Clear Filters
                  </Button>
                )
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredExams.map((exam) => {
                const lc = computeClientLifecycle(exam);
                const published = examResultsPublished(exam);
                const enrollCount = exam.enrollmentCount ?? exam.enrollment_count;
                const cls = exam.class_name ?? exam.className;
                return (
                  <Card key={exam.id} className="flex flex-col justify-between">
                    <CardContent className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 mb-2">
                            <Badge tone={lifecycleTone(lc)}>{lc}</Badge>
                            {published && <Badge tone="verified">Results Published</Badge>}
                            {cls && (
                              <Badge tone="neutral">
                                Class {cls}
                                {exam.section ? ` · Sec ${exam.section}` : ""}
                              </Badge>
                            )}
                            {exam.category && <Badge tone="neutral">{exam.category}</Badge>}
                            {exam.blueprint && exam.blueprint.length > 0 && (
                              <Badge tone="accent">Fair Blueprint</Badge>
                            )}
                          </div>
                          <Link
                            href={`/examiner/exams/${exam.id}`}
                            className="font-display text-base font-semibold text-foreground hover:text-accent transition-colors"
                          >
                            {exam.title}
                          </Link>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 rounded-sm border border-border bg-surface-subtle p-3 text-xs text-ink-muted">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-ink-subtle shrink-0" />
                          <span className="truncate">Starts: {safeFormatDate(examStartAt(exam))}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-ink-subtle shrink-0" />
                          <span className="truncate">Ends: {safeFormatDate(examEndAt(exam))}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-ink-subtle shrink-0" />
                          <span className="font-mono tabular-nums">{examDurationMin(exam)} min</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-ink-subtle shrink-0" />
                          <span className="font-mono tabular-nums">
                            {enrollCount !== undefined
                              ? `${enrollCount} enrolled · ${examTotalMarks(exam)} pts`
                              : `${examTotalMarks(exam)} pts`}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Link href={`/examiner/exams/${exam.id}`}>
                          <Button size="sm" variant="primary">
                            <Settings2 className="h-3.5 w-3.5" /> Manage
                          </Button>
                        </Link>
                        <Link href={`/examiner/exams/${exam.id}?tab=monitor`}>
                          <Button size="sm" variant="secondary">
                            <Activity className="h-3.5 w-3.5" /> Live Monitor
                          </Button>
                        </Link>
                        <Link href={`/examiner/exams/${exam.id}?tab=grading`}>
                          <Button size="sm" variant="secondary">
                            <BarChart3 className="h-3.5 w-3.5" /> Marks &amp; Analytics
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
                          <FileDown className="h-3.5 w-3.5" /> PDF
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Registered Classes Card */}
        <div className="space-y-4">
          <Card className="h-fit">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.05em]">
                    <GraduationCap className="h-4 w-4 text-accent" />
                    Registered Classes
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Click a class to filter its assigned exams.
                  </p>
                </div>
                <Badge tone="accent">{classes.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {classesQuery.isLoading ? (
                <div className="space-y-2.5">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : classes.length === 0 ? (
                <p className="text-xs text-ink-muted py-4 text-center">
                  No classes registered yet. When candidates sign up with a Class &amp; Section (or update their Profile), they appear here.
                </p>
              ) : (
                classes.map((cls) => {
                  const active = selectedClass === cls.className;
                  return (
                    <button
                      key={cls.className}
                      type="button"
                      onClick={() => setSelectedClass(active ? null : cls.className)}
                      className={`w-full rounded-sm border p-3 text-left transition-colors cursor-pointer ${
                        active
                          ? "border-accent bg-accent-soft/60"
                          : "border-border bg-surface-subtle hover:border-border-strong"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-foreground">
                          Class {cls.className}
                        </span>
                        <Badge tone="verified">{cls.totalStudents} students</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {cls.sections.map((s) => (
                          <span
                            key={s.section}
                            className="rounded-sm border border-border bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-muted"
                          >
                            Sec {s.section}: <strong>{s.studentCount}</strong>
                          </span>
                        ))}
                        {cls.examCount > 0 && (
                          <span className="ml-auto font-mono text-[11px] font-medium text-accent">
                            {cls.examCount} exam(s)
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
