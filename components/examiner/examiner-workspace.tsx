"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/client/api";
import type { ExaminerIntegrityReport } from "@/lib/client/api-types";
import { AnalyticsPanel } from "./analytics-panel";
import { CreateExamPanel } from "./create-exam-panel";
import { DashboardOverviewTab } from "./dashboard-overview-tab";
import { ExaminerShell } from "./examiner-shell";
import type { ExamTemplate, ExaminerTab } from "./examiner-types";
import { LiveMonitoringPanel } from "./live-monitoring-panel";
import { MyExamsPanel } from "./my-exams-panel";
import { QuestionBankPanel } from "./question-bank-panel";
import { ResultsReportsPanel } from "./results-reports-panel";
import { SettingsPanel } from "./settings-panel";

interface ExaminerWorkspaceProps {
  initialTab?: ExaminerTab;
  initialExamId?: string;
}

export function ExaminerWorkspace({
  initialTab = "dashboard",
  initialExamId,
}: ExaminerWorkspaceProps) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<ExaminerTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [days, setDays] = useState<7 | 30>(30);
  const [selectedExamId, setSelectedExamId] = useState<string | undefined>(initialExamId);

  // Create / Template / Edit state
  const [selectedTemplate, setSelectedTemplate] = useState<ExamTemplate | null>(null);
  const [editExamId, setEditExamId] = useState<string | null>(null);
  const [createNonce, setCreateNonce] = useState(0);

  // Integrity Audit state
  const [integrityReport, setIntegrityReport] = useState<ExaminerIntegrityReport | null>(null);

  const isAuthorized = Boolean(user && (user.role === "EXAMINER" || user.role === "ADMIN"));

  const overviewQuery = useQuery({
    queryKey: ["examiner-overview", days, selectedExamId ?? "auto"],
    queryFn: () => api.examiner.overview({ days, examId: selectedExamId }),
    enabled: isAuthorized,
    refetchInterval: 15_000,
  });

  const integrityMut = useMutation({
    mutationFn: (examId?: string) => api.examiner.integrityCheck(examId),
    onSuccess: (res) => {
      setIntegrityReport(res);
      if (res.allValid) {
        toast.success(
          `Integrity verified: ${res.attemptsChecked} attempt(s) & ${res.answersChecked} chained answers intact`
        );
      } else {
        toast.error(
          `Tampering detected in ${res.tamperedAttempts.length} attempt chain(s)!`
        );
      }
      qc.invalidateQueries({ queryKey: ["examiner-overview"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function openCreateBlank() {
    setEditExamId(null);
    setSelectedTemplate(null);
    setCreateNonce((n) => n + 1);
    setActiveTab("create");
  }

  function openCreateWithTemplate(tpl: ExamTemplate) {
    setEditExamId(null);
    setSelectedTemplate(tpl);
    setCreateNonce((n) => n + 1);
    setActiveTab("create");
  }

  function openEditExam(examId: string) {
    setSelectedTemplate(null);
    setEditExamId(examId);
    setCreateNonce((n) => n + 1);
    setActiveTab("create");
  }

  function openMonitorExam(examId: string) {
    setSelectedExamId(examId);
    setActiveTab("monitor");
  }

  function openResultsExam(examId: string) {
    setSelectedExamId(examId);
    setActiveTab("results");
  }

  const overview = overviewQuery.data;
  const exams = overview?.exams ?? [];

  return (
    <ExaminerShell
      activeTab={activeTab}
      onSelectTab={(tab) => {
        if (tab === "create") {
          openCreateBlank();
          return;
        }
        setActiveTab(tab);
      }}
      overview={overview}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onSelectExamForMonitor={openMonitorExam}
      onSelectExamForResults={openResultsExam}
      onVerifyIntegrity={() => integrityMut.mutate(undefined)}
      isVerifyingIntegrity={integrityMut.isPending}
      integrityReport={integrityReport}
      onDismissIntegrityReport={() => setIntegrityReport(null)}
    >
      {activeTab === "dashboard" && (
        <DashboardOverviewTab
          userName={user?.name ?? "Examiner"}
          overview={overview}
          isLoading={overviewQuery.isLoading}
          error={overviewQuery.error as Error | null}
          days={days}
          onChangeDays={setDays}
          focusExamId={selectedExamId}
          onChangeFocusExamId={setSelectedExamId}
          onNavigateTab={(tab) => {
            if (tab === "create") openCreateBlank();
            else setActiveTab(tab);
          }}
          onCreateNew={openCreateBlank}
          onUseTemplate={openCreateWithTemplate}
          onEditExam={openEditExam}
          onMonitorExam={openMonitorExam}
          onOpenResults={openResultsExam}
          onVerifyIntegrity={(examId) => integrityMut.mutate(examId)}
        />
      )}

      {activeTab === "create" && (
        <CreateExamPanel
          key={`create-panel-${createNonce}`}
          initialTemplate={selectedTemplate}
          editExamId={editExamId}
          onApplyTemplate={openCreateWithTemplate}
          onCancelEdit={() => {
            setEditExamId(null);
            setActiveTab("exams");
          }}
        />
      )}

      {activeTab === "questions" && <QuestionBankPanel globalSearch={searchQuery} />}

      {activeTab === "exams" && (
        <MyExamsPanel
          exams={exams}
          isLoading={overviewQuery.isLoading}
          searchQuery={searchQuery}
          onCreateNew={openCreateBlank}
          onEditExam={openEditExam}
          onMonitorExam={openMonitorExam}
          onOpenResults={openResultsExam}
        />
      )}

      {activeTab === "monitor" && (
        <LiveMonitoringPanel
          exams={exams}
          selectedExamId={selectedExamId}
          onSelectExam={setSelectedExamId}
          onCreateNew={openCreateBlank}
        />
      )}

      {activeTab === "results" && (
        <ResultsReportsPanel
          exams={exams}
          selectedExamId={selectedExamId}
          onSelectExam={setSelectedExamId}
          onCreateNew={openCreateBlank}
        />
      )}

      {activeTab === "analytics" && (
        <AnalyticsPanel
          exams={exams}
          insightsSeries={overview?.insightsSeries ?? []}
          days={days}
          onChangeDays={setDays}
          selectedExamId={selectedExamId}
          onSelectExam={setSelectedExamId}
        />
      )}

      {activeTab === "settings" && (
        <SettingsPanel
          onVerifyIntegrity={() => integrityMut.mutate(undefined)}
          isVerifyingIntegrity={integrityMut.isPending}
        />
      )}
    </ExaminerShell>
  );
}
