"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { Button, EmptyState } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import type { ExaminerExamSummary } from "@/lib/client/api-types";
import { GradingAnalyticsTab } from "./grading-analytics-tab";

interface ResultsReportsPanelProps {
  exams: ExaminerExamSummary[];
  selectedExamId?: string;
  onSelectExam: (examId: string) => void;
  onCreateNew: () => void;
}

function escapeCsvCell(val: unknown): string {
  const s = String(val ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

export function ResultsReportsPanel({
  exams,
  selectedExamId,
  onSelectExam,
  onCreateNew,
}: ResultsReportsPanelProps) {
  const qc = useQueryClient();

  const activeExam =
    exams.find((e) => e.id === selectedExamId) ??
    exams.find((e) => e.submittedCount > 0) ??
    exams[0] ??
    null;

  const togglePublishMut = useMutation({
    mutationFn: ({ id, resultsPublished }: { id: string; resultsPublished: boolean }) =>
      api.exams.update(id, { resultsPublished }),
    onSuccess: (res) => {
      const pub = Boolean(res.exam.results_published ?? res.exam.resultsPublished);
      toast.success(
        pub
          ? "Results published — candidates can now view scores & explanations"
          : "Results unpublished"
      );
      qc.invalidateQueries({ queryKey: ["examiner-overview"] });
      qc.invalidateQueries({ queryKey: ["exam-detail", activeExam?.id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const exportCsvMut = useMutation({
    mutationFn: async (exam: ExaminerExamSummary) => {
      const data = await api.exams.analytics(exam.id);
      const header = [
        "Candidate Name",
        "Email",
        "Status",
        "Score",
        "Max Score",
        "Pending Manual",
        "Submitted At",
        "Verify Code",
      ];
      const rows = data.candidates.map((c) => [
        c.candidate?.name ?? c.name ?? "Candidate",
        c.candidate?.email ?? c.email ?? "",
        c.status,
        c.score ?? "",
        c.maxScore ?? c.max_score ?? "",
        c.pendingManualCount ?? 0,
        c.submittedAt ?? c.submitted_at ?? "",
        c.verifyCode ?? c.verify_code ?? "",
      ]);

      const csvContent = [header, ...rows]
        .map((row) => row.map(escapeCsvCell).join(","))
        .join("\r\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `results-${exam.title.replace(/[^a-z0-9-_]/gi, "_").slice(0, 40)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    onSuccess: () => toast.success("Results CSV exported"),
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            Results, Manual Grading &amp; Reports
          </h1>
          <p className="text-sm text-slate-500">
            Grade written answers, publish candidate results, download cryptographic PDFs, and export CSV mark sheets.
          </p>
        </div>

        <Link href="/disputes">
          <Button variant="secondary" size="sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> Disputes Queue
          </Button>
        </Link>
      </div>

      {!activeExam ? (
        <EmptyState
          title="No examinations available"
          description="Create an exam and collect candidate submissions to view results and download reports."
          action={<Button onClick={onCreateNew}>Create Exam</Button>}
        />
      ) : (
        <>
          {/* Exam Switcher & Report Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="results-exam-select" className="text-xs font-semibold text-slate-600">
                Examination:
              </label>
              <select
                id="results-exam-select"
                value={activeExam.id}
                onChange={(e) => onSelectExam(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
              >
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title} ({ex.submittedCount} submitted)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={activeExam.resultsPublished ? "secondary" : "verified"}
                disabled={togglePublishMut.isPending}
                onClick={() =>
                  togglePublishMut.mutate({
                    id: activeExam.id,
                    resultsPublished: !activeExam.resultsPublished,
                  })
                }
              >
                <CheckCircle2 className="h-4 w-4" />
                {activeExam.resultsPublished ? "Unpublish Results" : "Publish Results"}
              </Button>

              <Button
                size="sm"
                variant="secondary"
                disabled={exportCsvMut.isPending}
                onClick={() => exportCsvMut.mutate(activeExam)}
              >
                <FileSpreadsheet className="h-4 w-4" /> Export CSV
              </Button>

              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    await api.reports.downloadExamPdf(activeExam.id, activeExam.title);
                    toast.success("Exam Summary PDF downloaded");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <FileDown className="h-4 w-4" /> Summary PDF
              </Button>
            </div>
          </div>

          <GradingAnalyticsTab examId={activeExam.id} />
        </>
      )}
    </div>
  );
}
