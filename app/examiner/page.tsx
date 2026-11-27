"use client";

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
  Plus,
  Settings2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
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

export default function ExaminerDashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["examiner-exams"],
    queryFn: () => api.exams.list(),
  });

  const exams = data?.exams ?? [];

  return (
    <AppShell
      allowedRoles={["ADMIN", "EXAMINER"]}
      title="Examiner Control Center"
      subtitle="Create blueprint-balanced exams, enroll candidates, monitor live sessions, and publish verifiable results."
      actions={
        <>
          <Link href="/examiner/questions">
            <Button variant="secondary">
              <BookOpen className="h-4 w-4" /> Question Bank
            </Button>
          </Link>
          <Link href="/examiner/exams/new">
            <Button>
              <Plus className="h-4 w-4" /> Create Exam
            </Button>
          </Link>
        </>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
          <Spinner /> Loading your exams…
        </div>
      ) : error ? (
        <Card>
          <CardContent className="text-sm text-danger">{(error as Error).message}</CardContent>
        </Card>
      ) : exams.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-10 w-10" />}
          title="No exams created yet"
          description="Build your first failure-resilient examination with automated seed commitments and live integrity monitoring."
          action={
            <Link href="/examiner/exams/new">
              <Button>
                <Plus className="h-4 w-4" /> Create Exam
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {exams.map((exam) => {
            const lc = computeClientLifecycle(exam);
            const published = examResultsPublished(exam);
            const enrollCount = exam.enrollmentCount ?? exam.enrollment_count;
            return (
              <Card key={exam.id} className="flex flex-col justify-between">
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <Badge tone={lifecycleTone(lc)}>{lc}</Badge>
                        {published && <Badge tone="verified">Results Published</Badge>}
                        {exam.blueprint && exam.blueprint.length > 0 && (
                          <Badge tone="accent">Fair Blueprint</Badge>
                        )}
                      </div>
                      <Link
                        href={`/examiner/exams/${exam.id}`}
                        className="text-lg font-semibold text-foreground hover:text-accent transition-colors"
                      >
                        {exam.title}
                      </Link>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-border bg-surface-subtle p-3 text-xs text-ink-muted">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-ink-subtle" />
                      <span>Starts: {safeFormatDate(examStartAt(exam))}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-ink-subtle" />
                      <span>Ends: {safeFormatDate(examEndAt(exam))}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-ink-subtle" />
                      <span>Duration: {examDurationMin(exam)} min</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-ink-subtle" />
                      <span>
                        {enrollCount !== undefined ? `${enrollCount} enrolled` : `${examTotalMarks(exam)} pts`}
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
                      <FileDown className="h-3.5 w-3.5" /> PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
