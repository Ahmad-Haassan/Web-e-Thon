"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Activity,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  FileDown,
  FlaskConical,
  Pencil,
  Plus,
  Send,
  Settings2,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Spinner,
} from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import type { ComputedExamLifecycle, ExaminerExamSummary } from "@/lib/client/api-types";

interface MyExamsPanelProps {
  exams: ExaminerExamSummary[];
  isLoading: boolean;
  searchQuery?: string;
  onCreateNew: () => void;
  onEditExam: (examId: string) => void;
  onMonitorExam: (examId: string) => void;
  onOpenResults: (examId: string) => void;
}

type LifecycleFilter = "ALL" | ComputedExamLifecycle;

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

export function MyExamsPanel({
  exams,
  isLoading,
  searchQuery = "",
  onCreateNew,
  onEditExam,
  onMonitorExam,
  onOpenResults,
}: MyExamsPanelProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<LifecycleFilter>("ALL");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const updateExamMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.exams.update(id, body),
    onSuccess: () => {
      toast.success("Exam updated");
      qc.invalidateQueries({ queryKey: ["examiner-overview"] });
      qc.invalidateQueries({ queryKey: ["examiner-exams"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteExamMut = useMutation({
    mutationFn: (id: string) => api.exams.delete(id),
    onSuccess: () => {
      toast.success("Exam deleted");
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ["examiner-overview"] });
      qc.invalidateQueries({ queryKey: ["examiner-exams"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sandboxMut = useMutation({
    mutationFn: (examId: string) =>
      api.attempts.start(examId, { isSandbox: true, integrityAck: true }),
    onSuccess: (res) => {
      toast.success("Sandbox preview started (excluded from all exam metrics)");
      router.push(`/exam/${res.attempt.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return exams.filter((ex) => {
      if (filter !== "ALL" && ex.lifecycle !== filter) return false;
      if (q && !ex.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [exams, filter, searchQuery]);

  const counts = useMemo(
    () => ({
      ALL: exams.length,
      ONGOING: exams.filter((e) => e.lifecycle === "ONGOING").length,
      PUBLISHED: exams.filter((e) => e.lifecycle === "PUBLISHED").length,
      DRAFT: exams.filter((e) => e.lifecycle === "DRAFT").length,
      COMPLETED: exams.filter((e) => e.lifecycle === "COMPLETED").length,
    }),
    [exams]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">My Examinations</h1>
          <p className="text-sm text-ink-subtle">
            Manage exam lifecycle, publish schedules, preview in Sandbox mode, and access monitoring or grading hubs.
          </p>
        </div>
        <Button onClick={onCreateNew}>
          <Plus className="h-4 w-4" /> Create New Exam
        </Button>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: "ALL", label: "All Exams" },
            { id: "ONGOING", label: "Ongoing" },
            { id: "PUBLISHED", label: "Scheduled" },
            { id: "DRAFT", label: "Drafts" },
            { id: "COMPLETED", label: "Completed" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
              filter === tab.id
                ? "border-[#1b4d3e] bg-accent text-accent-ink"
                : "border-border bg-surface text-ink-muted hover:bg-surface-subtle"
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                filter === tab.id ? "bg-surface/20 text-white" : "bg-surface-muted text-ink-muted"
              }`}
            >
              {counts[tab.id]}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-subtle">
          <Spinner /> Loading examinations…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-10 w-10" />}
          title={exams.length === 0 ? "No exams created yet" : "No matching examinations"}
          description={
            exams.length === 0
              ? "Build your first failure-resilient examination with automated seed commitments."
              : "Adjust your search or lifecycle filter above."
          }
          action={
            <Button onClick={onCreateNew}>
              <Plus className="h-4 w-4" /> Create Exam
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((exam) => (
            <Card
              key={exam.id}
              className="flex flex-col justify-between rounded-2xl border-border shadow-2xs"
            >
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={lifecycleTone(exam.lifecycle)}>
                        {exam.lifecycle === "PUBLISHED" ? "SCHEDULED" : exam.lifecycle}
                      </Badge>
                      {exam.resultsPublished && (
                        <Badge tone="verified">Results Published</Badge>
                      )}
                      {exam.hasBlueprint && <Badge tone="accent">Fair Blueprint</Badge>}
                      {exam.flaggedCount > 0 && (
                        <Badge tone="danger">{exam.flaggedCount} Flagged</Badge>
                      )}
                    </div>
                    <Link
                      href={`/examiner/exams/${exam.id}`}
                      className="block truncate text-lg font-bold text-foreground transition-colors hover:text-accent"
                    >
                      {exam.title}
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-border bg-surface-subtle p-3 text-xs text-ink-muted">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">
                      Starts: {format(new Date(exam.startAt), "MMM d, HH:mm")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">
                      Ends: {format(new Date(exam.endAt), "MMM d, HH:mm")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>
                      {exam.durationMin} min · {exam.totalMarks} marks
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>
                      {exam.enrolledCount} enrolled · {exam.submittedCount} submitted
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Link href={`/examiner/exams/${exam.id}`}>
                    <Button size="sm" variant="primary">
                      <Settings2 className="h-3.5 w-3.5" /> Manage
                    </Button>
                  </Link>

                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onEditExam(exam.id)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onMonitorExam(exam.id)}
                  >
                    <Activity className="h-3.5 w-3.5" /> Monitor
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onOpenResults(exam.id)}
                  >
                    <BarChart3 className="h-3.5 w-3.5" /> Results
                  </Button>

                  {exam.status === "DRAFT" && (
                    <Button
                      size="sm"
                      variant="verified"
                      disabled={updateExamMut.isPending}
                      onClick={() =>
                        updateExamMut.mutate({ id: exam.id, body: { status: "PUBLISHED" } })
                      }
                    >
                      <Send className="h-3.5 w-3.5" /> Publish
                    </Button>
                  )}

                  {exam.status === "PUBLISHED" && (
                    <Button
                      size="sm"
                      variant={exam.resultsPublished ? "secondary" : "verified"}
                      disabled={updateExamMut.isPending}
                      onClick={() =>
                        updateExamMut.mutate({
                          id: exam.id,
                          body: { resultsPublished: !exam.resultsPublished },
                        })
                      }
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {exam.resultsPublished ? "Unpublish Results" : "Publish Results"}
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    title="Sandbox Preview"
                    disabled={sandboxMut.isPending}
                    onClick={() => sandboxMut.mutate(exam.id)}
                  >
                    <FlaskConical className="h-3.5 w-3.5" /> Sandbox
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    title="Download Summary PDF"
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

                  {confirmDeleteId === exam.id ? (
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={deleteExamMut.isPending}
                        onClick={() => deleteExamMut.mutate(exam.id)}
                      >
                        Confirm Delete
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600"
                      onClick={() => setConfirmDeleteId(exam.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
