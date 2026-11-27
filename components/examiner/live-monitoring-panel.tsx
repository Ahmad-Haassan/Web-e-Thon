"use client";

import Link from "next/link";
import { Radio } from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import type { ExaminerExamSummary } from "@/lib/client/api-types";
import { MonitorTab } from "./monitor-tab";

interface LiveMonitoringPanelProps {
  exams: ExaminerExamSummary[];
  selectedExamId?: string;
  onSelectExam: (examId: string) => void;
  onCreateNew: () => void;
}

export function LiveMonitoringPanel({
  exams,
  selectedExamId,
  onSelectExam,
  onCreateNew,
}: LiveMonitoringPanelProps) {
  const activeExam =
    exams.find((e) => e.id === selectedExamId) ??
    exams.find((e) => e.lifecycle === "ONGOING") ??
    exams[0] ??
    null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Radio className="h-5 w-5 text-accent" />
            Live Session Monitoring
          </h1>
          <p className="text-sm text-ink-subtle">
            Real-time candidate progress, privacy-first review indicators, live announcements, and emergency one-time unlock codes.
          </p>
        </div>

        {activeExam && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Select exam to monitor"
              value={activeExam.id}
              onChange={(e) => onSelectExam(e.target.value)}
              className="h-10 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground shadow-2xs focus:border-accent focus:outline-none"
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title} ({ex.lifecycle} · {ex.inProgressCount} live)
                </option>
              ))}
            </select>
            <Link href={`/examiner/exams/${activeExam.id}?tab=enrollments`}>
              <Button variant="secondary" size="sm">
                Manage Enrollments
              </Button>
            </Link>
          </div>
        )}
      </div>

      {!activeExam ? (
        <EmptyState
          title="No examinations available to monitor"
          description="Create and publish an exam first to monitor live candidate sessions."
          action={<Button onClick={onCreateNew}>Create Exam</Button>}
        />
      ) : (
        <>
          {/* Live Strip */}
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-emerald-100 bg-surface p-4 shadow-2xs">
              <p className="text-xs font-semibold uppercase text-slate-400">In Progress</p>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-2xl font-bold text-emerald-600">{activeExam.inProgressCount}</p>
                <Badge tone="verified">Live</Badge>
              </div>
            </div>
            <div className="rounded-2xl border border-[#e6f1ec] bg-surface p-4 shadow-2xs">
              <p className="text-xs font-semibold uppercase text-slate-400">Submitted</p>
              <p className="mt-1 text-2xl font-bold text-accent">{activeExam.submittedCount}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4 shadow-2xs">
              <p className="text-xs font-semibold uppercase text-slate-400">Not Started</p>
              <p className="mt-1 text-2xl font-bold text-ink-muted">{activeExam.notStartedCount}</p>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-surface p-4 shadow-2xs">
              <p className="text-xs font-semibold uppercase text-slate-400">Flagged Queue</p>
              <p className="mt-1 text-2xl font-bold text-rose-600">{activeExam.flaggedCount}</p>
            </div>
          </div>

          <MonitorTab examId={activeExam.id} />
        </>
      )}
    </div>
  );
}
