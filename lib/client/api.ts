"use client";

import { getAccessToken, refreshAccessToken } from "./supabase";
import type {
  AnnouncementRecord,
  AppUser,
  AttemptResultResponse,
  AttemptSummary,
  BulkImportResponse,
  CategoryRecord,
  ChainVerificationResult,
  DisputeDetailResponse,
  DisputeRecord,
  DisputeStatus,
  DisputeType,
  EnrollmentRecord,
  ExamAnalyticsResponse,
  ExaminerIntegrityReport,
  ExaminerOverviewResponse,
  ExamRecord,
  FairnessReport,
  LockEventType,
  MonitorResponse,
  PublicVerifyAttemptResponse,
  PublicVerifyCodeResponse,
  PublicVerifyExamResponse,
  QuestionRecord,
  RegisteredClassSummary,
  SignedReceipt,
  StartAttemptResponse,
  UserRole,
  WorkspacePrefs,
} from "./api-types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface FetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  skipAuth?: boolean;
  retryOn401?: boolean;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method = "GET", body, skipAuth = false, retryOn401 = true, signal } = options;

  const doRequest = async (forceRefresh: boolean): Promise<Response> => {
    const headers = new Headers();
    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    if (!skipAuth) {
      const token = forceRefresh ? await refreshAccessToken() : await getAccessToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }
    return fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "include",
      cache: "no-store",
      signal,
    });
  };

  let res = await doRequest(false);

  if (res.status === 401 && !skipAuth && retryOn401) {
    res = await doRequest(true);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

  if (!res.ok) {
    const msg =
      (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : null) || `Request failed (${res.status})`;
    const details =
      payload && typeof payload === "object" && "details" in payload ? payload.details : undefined;
    throw new ApiError(res.status, msg, details);
  }

  return payload as T;
}

export async function downloadPdf(path: string, filename: string): Promise<void> {
  const token = await getAccessToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(path, {
    method: "GET",
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const errPayload = await res.json().catch(() => null);
    throw new ApiError(
      res.status,
      errPayload?.error ?? `Failed to generate PDF (${res.status})`
    );
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const api = {
  time: {
    get: () => apiFetch<{ now: number; iso: string }>("/api/time", { skipAuth: true }),
  },

  me: {
    get: () => apiFetch<{ user: AppUser }>("/api/me"),
    updateProfile: (body: {
      name?: string;
      phone?: string | null;
      className?: string | null;
      section?: string | null;
    }) => apiFetch<{ user: AppUser }>("/api/me", { method: "PATCH", body }),
    updatePrefs: (prefs: Partial<WorkspacePrefs>) =>
      apiFetch<{ prefs: WorkspacePrefs }>("/api/me/prefs", { method: "PATCH", body: prefs }),
  },

  classes: {
    list: () => apiFetch<{ classes: RegisteredClassSummary[] }>("/api/classes"),
  },

  admin: {
    overview: (days: 7 | 30 = 7) =>
      apiFetch<{
        stats: {
          totalStudents: number;
          activeStudents: number;
          studentsJoinedLast30Days?: number;
          avgMarksPct?: number;
          totalExaminers: number;
          totalUsers: number;
          totalExams: number;
          publishedExams: number;
          ongoingExams: number;
          totalAttempts: number;
          gradedAttempts: number;
          inProgressAttempts: number;
          totalQuestions: number;
          openDisputes: number;
          pendingApprovals?: number;
          platformHealthPct: number;
        };
        pendingUsers?: Array<{
          id: string;
          name: string;
          email: string;
          role: UserRole;
          active: boolean;
          created_at: string;
        }>;
        recentActivities: Array<{
          id: string;
          kind: "exam" | "submit" | "user" | "publish" | "dispute" | "security";
          title: string;
          subtitle: string;
          at: string;
        }>;
        analyticsSeries: Array<{
          label: string;
          date: string;
          examAttempts: number;
          activeUsers: number;
          totalStudents?: number;
          joinedStudents?: number;
          avgMarksPct?: number;
        }>;
        examBreakdown: Array<{
          id: string;
          title: string;
          status: string;
          lifecycle: string;
          startAt: string;
          endAt: string;
          totalMarks: number;
          resultsPublished: boolean;
          checkpointHash: string | null;
          enrolledCount: number;
          attemptsCount: number;
          submittedCount: number;
          avgPct: number;
          passRate: number;
        }>;
        notifications: {
          unreadCount: number;
          openDisputes: number;
          inProgressAttempts: number;
          recentDisputes: Array<{
            id: string;
            type: string;
            status: string;
            reason: string;
            created_at: string;
          }>;
        };
        serverNow: number;
      }>(`/api/admin/overview?days=${days}`),
    integrityCheck: () =>
      apiFetch<{
        allValid: boolean;
        checkedAt: string;
        attemptsChecked: number;
        examsChecked: number;
        answersChecked: number;
        eventsChecked: number;
        lockEventsChecked: number;
        tamperedAttempts: Array<{
          attemptId: string;
          verifyCode: string;
          chain: string;
          brokenAt: number;
        }>;
        invalidCheckpoints: Array<{ examId: string; title: string }>;
      }>("/api/admin/integrity-check", { method: "POST" }),
    exportData: (format: "json" | "csv" = "json") =>
      downloadPdf(
        `/api/admin/export?format=${format}`,
        `veriexam-${format === "csv" ? "results" : "backup"}-${new Date().toISOString().slice(0, 10)}.${format}`
      ),
    auditLogs: (params?: { entity?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.entity) qs.set("entity", params.entity);
      if (params?.limit) qs.set("limit", String(params.limit));
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return apiFetch<{
        logs: Array<{
          id: string;
          actor_id: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          before: unknown;
          after: unknown;
          at: string;
          users?: { id: string; name: string; email: string; role: string } | null;
        }>;
      }>(`/api/audit-logs${query}`);
    },
    finalizeExpired: () =>
      apiFetch<{ finalizedCount: number; at: string }>("/api/cron/finalize", {
        method: "POST",
      }),
    listUsers: (params?: { role?: string; search?: string }) => {
      const qs = new URLSearchParams();
      if (params?.role) qs.set("role", params.role);
      if (params?.search) qs.set("search", params.search);
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return apiFetch<{ users: AppUser[] }>(`/api/admin/users${query}`);
    },
    createUser: (body: {
      name: string;
      email: string;
      password?: string;
      role: UserRole;
      invite?: boolean;
    }) => apiFetch<{ user: AppUser }>("/api/admin/users", { method: "POST", body }),
    updateUser: (id: string, body: { name?: string; role?: UserRole; active?: boolean }) =>
      apiFetch<{ user: AppUser }>(`/api/admin/users/${id}`, { method: "PATCH", body }),
    deleteUser: (id: string, permanent = false) =>
      apiFetch<{ ok: true }>(`/api/admin/users/${id}${permanent ? "?permanent=true" : ""}`, {
        method: "DELETE",
      }),
  },

  categories: {
    list: () => apiFetch<{ categories: CategoryRecord[] }>("/api/categories"),
    create: (name: string) =>
      apiFetch<{ category: CategoryRecord }>("/api/categories", { method: "POST", body: { name } }),
  },

  questions: {
    list: (params?: {
      categoryId?: string;
      difficulty?: string;
      type?: string;
      search?: string;
    }) => {
      const qs = new URLSearchParams();
      if (params?.categoryId) qs.set("categoryId", params.categoryId);
      if (params?.difficulty) qs.set("difficulty", params.difficulty);
      if (params?.type) qs.set("type", params.type);
      if (params?.search) qs.set("search", params.search);
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return apiFetch<{ questions: QuestionRecord[] }>(`/api/questions${query}`);
    },
    get: (id: string) => apiFetch<{ question: QuestionRecord }>(`/api/questions/${id}`),
    create: (body: Record<string, unknown>) =>
      apiFetch<{ question: QuestionRecord }>("/api/questions", { method: "POST", body }),
    update: (id: string, body: Record<string, unknown>) =>
      apiFetch<{ question: QuestionRecord }>(`/api/questions/${id}`, { method: "PATCH", body }),
    delete: (id: string) =>
      apiFetch<{ ok: true }>(`/api/questions/${id}`, { method: "DELETE" }),
  },

  imports: {
    questions: (body: { csv?: string; rows?: Record<string, unknown>[] }) =>
      apiFetch<BulkImportResponse>("/api/import/questions", { method: "POST", body }),
    candidates: (body: {
      csv?: string;
      rows?: Array<{ name?: string; email: string; password?: string }>;
      examId?: string;
    }) => apiFetch<BulkImportResponse>("/api/import/candidates", { method: "POST", body }),
  },

  exams: {
    list: () =>
      apiFetch<{
        exams?: ExamRecord[];
        available?: ExamRecord[];
        upcoming?: ExamRecord[];
        completed?: ExamRecord[];
      }>("/api/exams"),
    get: (id: string) =>
      apiFetch<{
        exam: ExamRecord;
        questions?: QuestionRecord[];
        enrollmentCount?: number;
        fairnessReport?: FairnessReport | null;
      }>(`/api/exams/${id}`),
    create: (body: Record<string, unknown>) =>
      apiFetch<{ exam: ExamRecord }>("/api/exams", { method: "POST", body }),
    update: (id: string, body: Record<string, unknown>) =>
      apiFetch<{ exam: ExamRecord }>(`/api/exams/${id}`, { method: "PATCH", body }),
    delete: (id: string) => apiFetch<{ ok: true }>(`/api/exams/${id}`, { method: "DELETE" }),
    listEnrollments: (id: string) =>
      apiFetch<{ enrollments: EnrollmentRecord[] }>(`/api/exams/${id}/enroll`),
    enroll: (id: string, emails: string[]) =>
      apiFetch<{ enrolled: number; notFound: string[] }>(`/api/exams/${id}/enroll`, {
        method: "POST",
        body: { emails },
      }),
    enrollByClass: (id: string, className: string, section?: string) =>
      apiFetch<{ enrolled: number; notFound: string[] }>(`/api/exams/${id}/enroll`, {
        method: "POST",
        body: { className, section: section || undefined },
      }),
    fairness: (id: string) => apiFetch<FairnessReport>(`/api/exams/${id}/fairness`),
    monitor: (id: string) => apiFetch<MonitorResponse>(`/api/exams/${id}/monitor`),
    announcements: (id: string) =>
      apiFetch<{ announcements: AnnouncementRecord[] }>(`/api/exams/${id}/announcements`),
    postAnnouncement: (id: string, message: string) =>
      apiFetch<{ announcement: AnnouncementRecord }>(`/api/exams/${id}/announcements`, {
        method: "POST",
        body: { message },
      }),
    analytics: (id: string) => apiFetch<ExamAnalyticsResponse>(`/api/exams/${id}/analytics`),
  },

  examiner: {
    overview: (params?: { days?: 7 | 30; examId?: string }) => {
      const qs = new URLSearchParams();
      if (params?.days) qs.set("days", String(params.days));
      if (params?.examId) qs.set("examId", params.examId);
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return apiFetch<ExaminerOverviewResponse>(`/api/examiner/overview${query}`);
    },
    integrityCheck: (examId?: string) =>
      apiFetch<ExaminerIntegrityReport>("/api/examiner/integrity-check", {
        method: "POST",
        body: examId ? { examId } : {},
      }),
  },

  attempts: {
    start: (examId: string, body?: { isSandbox?: boolean; integrityAck?: boolean }) =>
      apiFetch<StartAttemptResponse>(`/api/exams/${examId}/attempts`, {
        method: "POST",
        body: body ?? { isSandbox: false, integrityAck: true },
      }),
    get: (id: string) => apiFetch<StartAttemptResponse>(`/api/attempts/${id}`),
    syncAnswers: (
      id: string,
      body: {
        answers: Array<{
          questionId: string;
          selected: string[] | string;
          marked: boolean;
          clientSeq: number;
          savedAt: string;
        }>;
        sessionToken?: string;
      }
    ) =>
      apiFetch<{ receipts: SignedReceipt[]; serverNow: number | string }>(
        `/api/attempts/${id}/answers`,
        { method: "POST", body }
      ),
    receipts: (id: string) =>
      apiFetch<{ receipts: SignedReceipt[]; chain: ChainVerificationResult }>(
        `/api/attempts/${id}/receipts`
      ),
    submit: (id: string) =>
      apiFetch<{
        attempt: AttemptSummary;
        score: number | null;
        maxScore: number;
        pendingManualCount: number;
        checkpointHash?: string | null;
      }>(`/api/attempts/${id}/submit`, { method: "POST" }),
    logEvent: (
      id: string,
      body: {
        type:
          | "TAB_BLUR"
          | "FULLSCREEN_EXIT"
          | "PASTE"
          | "COPY_ATTEMPT"
          | "DISCONNECT"
          | "RECONNECT"
          | "SAVE"
          | "TECHNICAL_INCIDENT"
          | "FAST_ANSWER";
        meta?: Record<string, unknown>;
        at?: string;
      }
    ) => apiFetch<{ event: unknown }>(`/api/attempts/${id}/events`, { method: "POST", body }),
    logLockEvent: (id: string, body: { type: LockEventType; meta?: Record<string, unknown> }) =>
      apiFetch<{
        lockEvent: unknown;
        escalation: "OK" | "WARN" | "FLAGGED" | "ALERT_EXAMINER";
      }>(`/api/attempts/${id}/lock-events`, { method: "POST", body }),
    issueUnlockCode: (
      id: string,
      body: { reason: string; expiresInSec?: number; grantExtraSec?: number }
    ) =>
      apiFetch<{ code: string; expiresAt: string; grantExtraSec: number }>(
        `/api/attempts/${id}/unlock-code`,
        { method: "POST", body }
      ),
    redeemUnlockCode: (id: string, code: string) =>
      apiFetch<{ ok: true; deadlineAt: string; lockEvent: unknown }>(
        `/api/attempts/${id}/unlock`,
        { method: "POST", body: { code } }
      ),
    getScratchpad: (id: string) =>
      apiFetch<{
        scratchpad: {
          text_content?: string;
          textContent?: string;
          drawing_json?: unknown[];
          drawingJson?: unknown[];
        } | null;
      }>(`/api/attempts/${id}/scratchpad`),
    saveScratchpad: (id: string, body: { textContent: string; drawingJson: unknown[] }) =>
      apiFetch<{ scratchpad: unknown }>(`/api/attempts/${id}/scratchpad`, {
        method: "PUT",
        body,
      }),
    grade: (id: string, body: { questionId: string; awarded: number; feedback?: string }) =>
      apiFetch<{ attempt: AttemptSummary; grade: unknown; pendingManualCount: number }>(
        `/api/attempts/${id}/grade`,
        { method: "POST", body }
      ),
    result: (id: string) => apiFetch<AttemptResultResponse>(`/api/attempts/${id}/result`),
  },

  disputes: {
    list: (params?: { examId?: string; status?: string }) => {
      const qs = new URLSearchParams();
      if (params?.examId) qs.set("examId", params.examId);
      if (params?.status) qs.set("status", params.status);
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return apiFetch<{ disputes: DisputeRecord[] }>(`/api/disputes${query}`);
    },
    create: (body: {
      attemptId: string;
      questionId?: string | null;
      type: DisputeType;
      reason: string;
    }) => apiFetch<{ dispute: DisputeRecord }>("/api/disputes", { method: "POST", body }),
    get: (id: string) => apiFetch<DisputeDetailResponse>(`/api/disputes/${id}`),
    resolve: (
      id: string,
      body: {
        status: Exclude<DisputeStatus, "OPEN">;
        resolution: string;
        newAwarded?: number;
      }
    ) =>
      apiFetch<{ dispute: DisputeRecord; rescoredAttemptsCount?: number }>(
        `/api/disputes/${id}`,
        { method: "PATCH", body }
      ),
  },

  verify: {
    byCode: (code: string) =>
      apiFetch<PublicVerifyCodeResponse>(`/api/verify/${encodeURIComponent(code)}`, {
        skipAuth: true,
      }),
    attempt: (id: string) =>
      apiFetch<PublicVerifyAttemptResponse>(`/api/verify/attempt/${encodeURIComponent(id)}`, {
        skipAuth: true,
      }),
    exam: (id: string) =>
      apiFetch<PublicVerifyExamResponse>(`/api/verify/exam/${encodeURIComponent(id)}`, {
        skipAuth: true,
      }),
  },

  reports: {
    downloadExamPdf: (id: string, title?: string) =>
      downloadPdf(
        `/api/reports/exam/${id}/pdf`,
        `exam-summary-${(title || id).replace(/[^a-z0-9-_]/gi, "_").slice(0, 40)}.pdf`
      ),
    downloadAttemptPdf: (id: string, verifyCode?: string) =>
      downloadPdf(
        `/api/reports/attempt/${id}/pdf`,
        `result-${verifyCode || id}.pdf`
      ),
  },
};
