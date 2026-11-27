"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarDays, Clock, FileBadge2, MapPin, Play } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, CardContent, EmptyState, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import {
  computeClientLifecycle,
  examDurationMin,
  examEndAt,
  examStartAt,
  examTotalMarks,
  type ExamRecord,
} from "@/lib/client/api-types";

export default function CandidateDatesheetPage() {
  const examsQuery = useQuery({
    queryKey: ["candidate-exams"],
    queryFn: () => api.exams.list(),
  });

  const sortedExams = useMemo(() => {
    const all: ExamRecord[] = [
      ...(examsQuery.data?.available ?? []),
      ...(examsQuery.data?.upcoming ?? []),
      ...(examsQuery.data?.completed ?? []),
      ...(examsQuery.data?.exams ?? []),
    ];
    const dedup = Array.from(new Map(all.map((e) => [e.id, e])).values());
    return dedup.sort(
      (a, b) => new Date(examStartAt(a)).getTime() - new Date(examStartAt(b)).getTime()
    );
  }, [examsQuery.data]);

  return (
    <AppShell
      allowedRoles={["CANDIDATE", "ADMIN", "EXAMINER"]}
      title="My Exam Datesheet"
      subtitle="Your scheduled examination windows, allocated durations, and class details. Bring or verify your admit card before every exam."
      actions={
        <Link href="/candidate/admit-card">
          <Button>
            <FileBadge2 className="h-4 w-4" /> Admit Card
          </Button>
        </Link>
      }
    >
      <div className="mx-auto max-w-3xl space-y-4">
        {examsQuery.isLoading ? (
          <>
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
          </>
        ) : sortedExams.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-9 w-9" />}
            title="No scheduled examinations"
            description="Once an examiner assigns an exam to your class or email, it will appear on your datesheet."
          />
        ) : (
          sortedExams.map((exam) => {
            const lc = computeClientLifecycle(exam);
            const start = new Date(examStartAt(exam));
            const end = new Date(examEndAt(exam));
            const cls = exam.class_name ?? exam.className;
            const validDates = !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime());

            return (
              <Card key={exam.id}>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                        {exam.category || "ONLINE EXAMINATION"}
                      </p>
                      <h2 className="mt-0.5 font-display text-lg font-bold text-foreground">
                        {exam.title}
                      </h2>
                      {cls && (
                        <p className="text-xs text-ink-subtle">
                          {cls}
                          {exam.section ? `-${exam.section}` : ""}
                        </p>
                      )}
                    </div>
                    <Badge
                      tone={
                        lc === "ONGOING"
                          ? "verified"
                          : lc === "PUBLISHED"
                          ? "accent"
                          : "neutral"
                      }
                    >
                      {lc}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs sm:text-sm text-ink-muted pt-1">
                    <p className="flex items-center gap-2.5">
                      <CalendarDays className="h-4 w-4 text-accent shrink-0" />
                      <span>
                        {validDates ? format(start, "EEEE, dd MMMM yyyy") : "Scheduled"}
                      </span>
                    </p>
                    <p className="flex items-center gap-2.5">
                      <Clock className="h-4 w-4 text-accent shrink-0" />
                      <span>
                        {validDates
                          ? `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`
                          : "—"}{" "}
                        · <strong>{examDurationMin(exam)} min</strong> duration
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="flex items-center gap-2.5">
                        <MapPin className="h-4 w-4 text-accent shrink-0" />
                        <span>
                          VeriExam Online Portal ·{" "}
                          <span className="inline-block rounded-[2px] bg-accent-soft px-2 py-0.5 font-mono text-xs font-semibold text-foreground tabular-nums">
                            {examTotalMarks(exam)} Marks
                          </span>
                        </span>
                      </span>

                      {lc === "ONGOING" && !exam.attempt && (
                        <Link href={`/exam/instructions/${exam.id}`}>
                          <Button size="sm">
                            <Play className="h-3.5 w-3.5" /> Start Exam
                          </Button>
                        </Link>
                      )}
                      {exam.attempt?.status === "IN_PROGRESS" && (
                        <Link href={`/exam/${exam.attempt.id}`}>
                          <Button size="sm" variant="verified">
                            <Play className="h-3.5 w-3.5" /> Resume
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
