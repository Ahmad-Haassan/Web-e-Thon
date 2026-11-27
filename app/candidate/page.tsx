"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Award,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileBadge2,
  FileDown,
  FileWarning,
  Play,
  Search,
  ShieldCheck,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  Skeleton,
} from "@/components/ui/primitives";
import { useAuth } from "@/hooks/use-auth";
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
} from "@/lib/client/api-types";

function fmt(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, "MMM d, yyyy · HH:mm");
}

function ScoreDonutGauge({ pct, standing }: { pct: number | null; standing: string }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const displayPct = pct !== null ? Math.min(100, Math.max(0, pct)) : 0;
  const dashOffset = circumference - (displayPct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2 shrink-0">
      <div className="relative flex h-28 w-28 items-center justify-center">
        <svg className="h-28 w-28 -rotate-90" viewBox="0 0 112 112">
          <circle
            cx="56"
            cy="56"
            r={radius}
            fill="none"
            stroke="rgba(251,233,199,0.16)"
            strokeWidth="8"
          />
          <circle
            cx="56"
            cy="56"
            r={radius}
            fill="none"
            stroke="#f3c874"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#fbe9c7]/65">
            AVG SCORE
          </span>
          <span className="font-display text-2xl font-bold text-[#fbe9c7] tabular-nums leading-tight">
            {pct !== null ? `${pct}%` : "—"}
          </span>
          <span className="text-[10px] text-[#fbe9c7]/60">out of 100</span>
        </div>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fbe9c7]/25 bg-[#fbe9c7]/10 px-3 py-0.5 text-[11px] font-medium text-[#fbe9c7]">
        <Award className="h-3 w-3 text-[#f3c874]" />
        {standing}
      </span>
    </div>
  );
}

export default function CandidateDashboardPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const examsQuery = useQuery({
    queryKey: ["candidate-exams"],
    queryFn: () => api.exams.list(),
  });

  const { available, upcoming, completed, allExams, avgPct, standing } = useMemo(() => {
    const avail: ExamRecord[] = [...(examsQuery.data?.available ?? [])];
    const upc: ExamRecord[] = [...(examsQuery.data?.upcoming ?? [])];
    const comp: ExamRecord[] = [...(examsQuery.data?.completed ?? [])];

    if (
      avail.length === 0 &&
      upc.length === 0 &&
      comp.length === 0 &&
      examsQuery.data?.exams?.length
    ) {
      for (const ex of examsQuery.data.exams) {
        const lc = computeClientLifecycle(ex);
        const st = ex.attempt?.status;
        if (st === "SUBMITTED" || st === "EXPIRED" || st === "GRADED" || lc === "COMPLETED") {
          comp.push(ex);
        } else if (lc === "ONGOING") {
          avail.push(ex);
        } else {
          upc.push(ex);
        }
      }
    }

    const all = [...avail, ...upc, ...comp];

    // Compute average percentage across published graded results
    const gradedPcts: number[] = [];
    for (const ex of comp) {
      const att = ex.attempt;
      const max = att ? attemptMaxScore(att) : examTotalMarks(ex);
      if (att && examResultsPublished(ex) && att.score !== null && att.score !== undefined && max > 0) {
        gradedPcts.push(Math.round((Number(att.score) / max) * 100));
      }
    }
    const avg =
      gradedPcts.length > 0
        ? Math.round(gradedPcts.reduce((s, v) => s + v, 0) / gradedPcts.length)
        : null;
    const stand =
      avg === null
        ? "Active"
        : avg >= 85
        ? "Distinction"
        : avg >= 70
        ? "Good Standing"
        : avg >= 50
        ? "Satisfactory"
        : "Needs Review";

    const q = search.trim().toLowerCase();
    const match = (e: ExamRecord) =>
      !q ||
      e.title.toLowerCase().includes(q) ||
      (e.category ?? "").toLowerCase().includes(q) ||
      (e.class_name ?? e.className ?? "").toLowerCase().includes(q);

    return {
      available: avail.filter(match),
      upcoming: upc.filter(match),
      completed: comp.filter(match),
      allExams: all,
      avgPct: avg,
      standing: stand,
    };
  }, [examsQuery.data, search]);

  const firstName = (user?.name ?? "Student").split(/\s+/)[0].toUpperCase();
  const todayLabel = format(new Date(), "EEEE, dd-MM-yyyy");

  const quickLinks = [
    { href: "/candidate/datesheet", label: "My Datesheet", icon: CalendarDays },
    { href: "/candidate/admit-card", label: "Admit Card", icon: FileBadge2 },
    { href: "#heading-completed", label: "My Marks", icon: CheckCircle2 },
    { href: "/disputes", label: "My Disputes", icon: FileWarning },
    { href: "/verify", label: "Public Verify", icon: ShieldCheck },
    { href: "/profile", label: "My Profile", icon: User },
  ];

  return (
    <AppShell allowedRoles={["CANDIDATE", "ADMIN", "EXAMINER"]} hideTitleHeader>
      <div className="space-y-6">
        {/* NIIT AMS-Style Hero Banner with Circular Gauge */}
        <section className="rounded-[2px] portal-chrome border border-[var(--portal-chrome-border)] p-6 sm:p-8 surface-elevated">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div className="space-y-3">
              <p className="inline-flex items-center gap-2 text-xs font-medium text-[#f3c874]">
                <Calendar className="h-3.5 w-3.5" />
                {todayLabel}
              </p>

              <h1 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-[#fbe9c7]">
                Welcome back, <span className="text-[#f3c874]">{firstName}</span>!
              </h1>

              <p className="text-xs sm:text-sm text-[#fbe9c7]/75">
                Active Examination Portal · Offline-Resilient &amp; Verifiable Assessments
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fbe9c7]/20 bg-[#fbe9c7]/10 px-3 py-1 text-[11px] font-medium text-[#fbe9c7]">
                  <span className="text-[#fbe9c7]/60 uppercase">CLASS</span>
                  <strong className="font-mono">{user?.class_name || "GENERAL"}</strong>
                </span>
                {user?.section && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fbe9c7]/20 bg-[#fbe9c7]/10 px-3 py-1 text-[11px] font-medium text-[#fbe9c7]">
                    <span className="text-[#fbe9c7]/60 uppercase">SECTION</span>
                    <strong className="font-mono">{user.section}</strong>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fbe9c7]/20 bg-[#fbe9c7]/10 px-3 py-1 text-[11px] font-medium text-[#fbe9c7]">
                  <span className="text-[#fbe9c7]/60 uppercase">ENROLLED</span>
                  <strong className="font-mono tabular-nums">{allExams.length} EXAMS</strong>
                </span>
              </div>
            </div>

            <ScoreDonutGauge pct={avgPct} standing={standing} />
          </div>
        </section>

        {/* 6-Tile Quick Links Bar (Matches NIIT AMS Student Dashboard) */}
        <section aria-label="Quick links" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {quickLinks.map((ql) => {
            const Icon = ql.icon;
            return (
              <Link
                key={ql.label}
                href={ql.href}
                className="flex flex-col items-center justify-center gap-2.5 rounded-[2px] border border-border bg-surface px-3 py-4 text-center surface-card hover:border-border-strong hover:bg-surface-subtle transition-colors"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-[2px] bg-accent-soft text-accent">
                  <Icon className="h-5 w-5" strokeWidth={1.7} />
                </span>
                <span className="text-xs font-semibold text-foreground">{ql.label}</span>
              </Link>
            );
          })}
        </section>

        {/* Search Bar */}
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exams by title, subject, or class…"
            className="pl-9 h-10"
          />
        </div>

        {examsQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
        ) : examsQuery.error ? (
          <Card>
            <CardContent className="text-sm text-danger">
              {(examsQuery.error as Error).message}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* AVAILABLE NOW */}
            <section aria-labelledby="heading-available">
              <div className="mb-3 flex items-center justify-between">
                <h2
                  id="heading-available"
                  className="font-display text-base font-bold uppercase tracking-[0.03em] text-foreground"
                >
                  Available Now ({available.length})
                </h2>
                <Badge tone="verified">Window Open</Badge>
              </div>

              {available.length === 0 ? (
                <EmptyState
                  title="No exams open right now"
                  description="When an examiner publishes an exam assigned to you or your class and its scheduled window begins, it will appear here."
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {available.map((exam) => {
                    const inProgress = exam.attempt?.status === "IN_PROGRESS";
                    const cls = exam.class_name ?? exam.className;
                    return (
                      <Card key={exam.id} className="border-accent/40">
                        <CardContent className="space-y-4">
                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                                {exam.category || "ONLINE EXAMINATION"}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <Badge tone="verified">ONGOING</Badge>
                                {inProgress && <Badge tone="warning">In Progress</Badge>}
                              </div>
                            </div>
                            <h3 className="font-display text-lg font-bold text-foreground">
                              {exam.title}
                            </h3>
                            {cls && (
                              <p className="text-xs text-ink-subtle mt-0.5">
                                Class {cls}
                                {exam.section ? ` · Section ${exam.section}` : ""}
                              </p>
                            )}
                          </div>

                          <div className="space-y-1.5 border-t border-border pt-3 text-xs text-ink-muted">
                            <p className="flex items-center gap-2">
                              <Clock className="h-3.5 w-3.5 text-accent" />
                              Duration: <strong className="text-foreground">{examDurationMin(exam)} minutes</strong>
                            </p>
                            <p className="flex items-center gap-2">
                              <Calendar className="h-3.5 w-3.5 text-accent" />
                              Window closes: <strong className="text-foreground">{fmt(examEndAt(exam))}</strong>
                            </p>
                          </div>

                          <div className="flex items-center justify-between border-t border-border pt-3">
                            <span className="rounded-[2px] bg-accent-soft px-2.5 py-1 font-mono text-xs font-semibold text-foreground tabular-nums">
                              {exam.questionCount ? `${exam.questionCount} Qs · ` : ""}
                              {examTotalMarks(exam)} Marks
                            </span>
                            {inProgress && exam.attempt ? (
                              <Link href={`/exam/${exam.attempt.id}`}>
                                <Button variant="verified" size="sm">
                                  <Play className="h-3.5 w-3.5" /> Resume Attempt
                                </Button>
                              </Link>
                            ) : (
                              <Link href={`/exam/instructions/${exam.id}`}>
                                <Button size="sm">
                                  <Play className="h-3.5 w-3.5" /> Instructions &amp; Start
                                </Button>
                              </Link>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>

            {/* UPCOMING */}
            <section aria-labelledby="heading-upcoming">
              <div className="mb-3 flex items-center justify-between">
                <h2
                  id="heading-upcoming"
                  className="font-display text-base font-bold uppercase tracking-[0.03em] text-foreground"
                >
                  Upcoming Scheduled ({upcoming.length})
                </h2>
                <Link
                  href="/candidate/datesheet"
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  Full Datesheet →
                </Link>
              </div>
              {upcoming.length === 0 ? (
                <p className="text-sm text-ink-muted">No upcoming scheduled exams.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {upcoming.map((exam) => (
                    <Card key={exam.id}>
                      <CardContent className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                            {exam.category || "SCHEDULED EXAM"}
                          </span>
                          <Badge tone="accent">UPCOMING</Badge>
                        </div>
                        <h3 className="font-display text-base font-bold text-foreground">
                          {exam.title}
                        </h3>
                        <p className="text-xs text-ink-muted">
                          Opens: <strong className="text-foreground">{fmt(examStartAt(exam))}</strong> ·{" "}
                          {examDurationMin(exam)} min · {examTotalMarks(exam)} marks
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* COMPLETED & MARKS */}
            <section aria-labelledby="heading-completed">
              <h2
                id="heading-completed"
                className="mb-3 font-display text-base font-bold uppercase tracking-[0.03em] text-foreground"
              >
                My Marks &amp; Completed Exams ({completed.length})
              </h2>
              {completed.length === 0 ? (
                <p className="text-sm text-ink-muted">No completed exams yet.</p>
              ) : (
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border bg-surface-subtle text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">
                        <tr>
                          <th className="px-5 py-3">Examination</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Max</th>
                          <th className="px-4 py-3 text-right">Obtained</th>
                          <th className="px-5 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {completed.map((exam) => {
                          const att = exam.attempt;
                          const published = examResultsPublished(exam);
                          const code = att ? attemptVerifyCode(att) : "";
                          const maxScore = att ? attemptMaxScore(att) : examTotalMarks(exam);
                          const scorePct =
                            att && published && att.score !== null && att.score !== undefined && maxScore > 0
                              ? (Number(att.score) / maxScore) * 100
                              : null;
                          const scoreColor =
                            scorePct === null
                              ? "text-ink-subtle"
                              : scorePct >= 75
                              ? "text-verified"
                              : scorePct >= 50
                              ? "text-warning"
                              : "text-danger";

                          return (
                            <tr key={exam.id} className="hover:bg-surface-subtle/60">
                              <td className="px-5 py-3.5">
                                <p className="font-semibold text-foreground">{exam.title}</p>
                                <p className="text-xs text-ink-subtle">
                                  Closed {fmt(examEndAt(exam))}
                                </p>
                              </td>
                              <td className="px-4 py-3.5">
                                <Badge tone={published ? "verified" : "neutral"}>
                                  {att?.status ?? "COMPLETED"}
                                </Badge>
                              </td>
                              <td className="px-4 py-3.5 text-right font-mono tabular-nums text-ink-muted">
                                {maxScore}
                              </td>
                              <td className={`px-4 py-3.5 text-right font-mono font-bold tabular-nums ${scoreColor}`}>
                                {att && published && att.score !== null && att.score !== undefined
                                  ? Number(att.score).toFixed(2)
                                  : "—"}
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                  {att && published ? (
                                    <>
                                      <Link href={`/results/${att.id}`}>
                                        <Button size="sm">View Breakdown</Button>
                                      </Link>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={async () => {
                                          try {
                                            await api.reports.downloadAttemptPdf(att.id, code);
                                            toast.success("Result PDF downloaded");
                                          } catch (e) {
                                            toast.error((e as Error).message);
                                          }
                                        }}
                                      >
                                        <FileDown className="h-3.5 w-3.5" /> PDF
                                      </Button>
                                    </>
                                  ) : att ? (
                                    <Badge tone="warning">Awaiting Publication</Badge>
                                  ) : (
                                    <Badge tone="neutral">Not Attempted</Badge>
                                  )}
                                  {code && (
                                    <Link href={`/verify/${encodeURIComponent(code)}`}>
                                      <Button size="sm" variant="ghost" title="Verify certificate">
                                        <ShieldCheck className="h-3.5 w-3.5 text-verified" />
                                      </Button>
                                    </Link>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
