"use client";

import { Suspense } from "react";
import { Spinner } from "@/components/ui/primitives";
import { ExaminerWorkspace } from "@/components/examiner/examiner-workspace";

export default function NewExamPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f5f6f5]">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <Spinner className="h-5 w-5 text-[#1b4d3e]" />
            Loading Exam Builder…
          </div>
        </div>
      }
    >
      <ExaminerWorkspace initialTab="create" />
    </Suspense>
  );
}
