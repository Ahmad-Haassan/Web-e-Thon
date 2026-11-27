"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, FileBadge2, Printer } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  BrandMark,
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Skeleton,
} from "@/components/ui/primitives";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/client/api";
import {
  examDurationMin,
  examEndAt,
  examStartAt,
  examTotalMarks,
  type ExamRecord,
} from "@/lib/client/api-types";

export default function CandidateAdmitCardPage() {
  const { user } = useAuth();

  const examsQuery = useQuery({
    queryKey: ["candidate-exams"],
    queryFn: () => api.exams.list(),
  });

  const enrolledExams = useMemo(() => {
    const all: ExamRecord[] = [
      ...(examsQuery.data?.available ?? []),
      ...(examsQuery.data?.upcoming ?? []),
      ...(examsQuery.data?.completed ?? []),
      ...(examsQuery.data?.exams ?? []),
    ];
    return Array.from(new Map(all.map((e) => [e.id, e])).values()).sort(
      (a, b) => new Date(examStartAt(a)).getTime() - new Date(examStartAt(b)).getTime()
    );
  }, [examsQuery.data]);

  return (
    <AppShell
      allowedRoles={["CANDIDATE", "ADMIN", "EXAMINER"]}
      title="Exam Admit Card"
      subtitle="Official clearance slip and enrolled examination schedule."
      actions={
        <Button onClick={() => window.print()} className="no-print">
          <Printer className="h-4 w-4" /> Download / Print Admit Card
        </Button>
      }
    >
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <BrandMark />
              <div>
                <h2 className="font-display text-base font-bold uppercase tracking-[0.03em] text-foreground">
                  Examination Admit Card
                </h2>
                <p className="text-xs text-ink-subtle tabular-nums">
                  {enrolledExams.length} enrolled paper(s)
                </p>
              </div>
            </div>
            <Badge tone="verified">CLEARED</Badge>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Green Clearance Banner (Admit Card Pattern) */}
            <div className="flex items-start gap-3 rounded-[2px] border border-verified/30 bg-verified-soft px-4 py-3 text-xs sm:text-sm text-verified">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">You are cleared to sit these examinations</p>
                <p className="text-xs opacity-90">
                  Ensure a stable sign-in before the exam window begins. Answers are locally resilient if Wi-Fi drops.
                </p>
              </div>
            </div>

            {/* Candidate Identity Grid */}
            <div className="grid gap-3 sm:grid-cols-4 rounded-[2px] border border-border bg-surface-subtle p-4 text-xs">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                  Candidate Name
                </p>
                <p className="mt-0.5 font-semibold text-foreground">{user?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                  Institutional Email
                </p>
                <p className="mt-0.5 font-mono text-foreground truncate">{user?.email ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                  Class / Cohort
                </p>
                <p className="mt-0.5 font-mono font-semibold text-foreground">
                  {user?.class_name || "General"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                  Section
                </p>
                <p className="mt-0.5 font-mono font-semibold text-foreground">
                  {user?.section ? `Section ${user.section}` : "—"}
                </p>
              </div>
            </div>

            {/* Divided Schedule List */}
            {examsQuery.isLoading ? (
              <div className="space-y-2.5">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : enrolledExams.length === 0 ? (
              <EmptyState
                icon={<FileBadge2 className="h-8 w-8" />}
                title="No papers listed on admit card"
                description="You have no enrolled published exams yet."
                action={
                  <Link href="/candidate">
                    <Button variant="secondary" size="sm">
                      Back to Dashboard
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="divide-y divide-border rounded-[2px] border border-border">
                {enrolledExams.map((exam) => {
                  const start = new Date(examStartAt(exam));
                  const end = new Date(examEndAt(exam));
                  const valid = !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime());
                  return (
                    <div
                      key={exam.id}
                      className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-display text-sm font-bold text-foreground">
                          {exam.title}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {valid
                            ? `${format(start, "EEE, dd MMM yyyy · h:mm a")} – ${format(end, "h:mm a")}`
                            : "Scheduled"}{" "}
                          · {examDurationMin(exam)} min
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded-[2px] bg-accent-soft px-2.5 py-1 font-mono text-xs font-semibold text-foreground tabular-nums">
                          {examTotalMarks(exam)} Marks
                        </span>
                        <Badge tone="verified">Enrolled</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
