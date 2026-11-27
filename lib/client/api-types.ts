import type {
  AppUser,
  AttemptStatus,
  BlueprintRule,
  ChainVerificationResult,
  ClientSnapshotQuestion,
  ComputedExamLifecycle,
  DisputeStatus,
  DisputeType,
  ExamStatus,
  IntegrityIndicators,
  LockEventType,
  PartialCreditConfig,
  QuestionType,
  RegisteredClassSummary,
  SignedReceipt,
  UserRole,
  WorkspacePrefs,
} from "@/lib/shared/types";

export type {
  AppUser,
  AttemptStatus,
  BlueprintRule,
  ChainVerificationResult,
  ClientSnapshotQuestion,
  ComputedExamLifecycle,
  DisputeStatus,
  DisputeType,
  ExamStatus,
  IntegrityIndicators,
  LockEventType,
  PartialCreditConfig,
  QuestionType,
  RegisteredClassSummary,
  SignedReceipt,
  UserRole,
  WorkspacePrefs,
};

export interface CategoryRecord {
  id: string;
  name: string;
  created_at?: string;
}

export interface QuestionOptionRecord {
  id: string;
  question_id?: string;
  text: string;
  order_index?: number;
  isCorrect?: boolean;
  is_correct?: boolean;
}

export interface QuestionRecord {
  id: string;
  owner_id?: string;
  category_id?: string | null;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  type: QuestionType;
  difficulty: 1 | 2 | 3;
  text: string;
  marks: number;
  negative_marking?: number;
  negativeMarking?: number;
  explanation?: string | null;
  written_rubric?: string | null;
  writtenRubric?: string | null;
  options?: QuestionOptionRecord[];
  correctOptionIds?: string[];
  correct_option_ids?: string[];
  question_keys?:
    | { correct_option_ids?: string[]; written_rubric?: string | null }
    | Array<{ correct_option_ids?: string[]; written_rubric?: string | null }>
    | null;
  created_at?: string;
}

export interface ExamRecord {
  id: string;
  owner_id?: string;
  ownerId?: string;
  title: string;
  category?: string | null;
  class_name?: string | null;
  className?: string | null;
  section?: string | null;
  rules?: string[];
  questionCount?: number;
  instructions?: string;
  start_at?: string;
  startAt?: string;
  end_at?: string;
  endAt?: string;
  duration_min?: number;
  durationMin?: number;
  total_marks?: number;
  totalMarks?: number;
  status: ExamStatus;
  lifecycle?: ComputedExamLifecycle;
  shuffle_questions?: boolean;
  shuffleQuestions?: boolean;
  shuffle_options?: boolean;
  shuffleOptions?: boolean;
  blueprint?: BlueprintRule[] | null;
  results_published?: boolean;
  resultsPublished?: boolean;
  grace_sec?: number;
  graceSec?: number;
  partial_credit_config?: PartialCreditConfig;
  partialCreditConfig?: PartialCreditConfig;
  per_question_timer_sec?: number | null;
  perQuestionTimerSec?: number | null;
  no_backtrack?: boolean;
  noBacktrack?: boolean;
  seed_commitment?: string | null;
  seedCommitment?: string | null;
  seed_reveal?: string | null;
  seedReveal?: string | null;
  checkpoint_hash?: string | null;
  checkpointHash?: string | null;
  enrollmentCount?: number;
  enrollment_count?: number;
  attempt?: AttemptSummary | null;
}

export interface AttemptSummary {
  id: string;
  exam_id?: string;
  examId?: string;
  candidate_id?: string;
  candidateId?: string;
  is_sandbox?: boolean;
  isSandbox?: boolean;
  started_at?: string;
  startedAt?: string;
  deadline_at?: string;
  deadlineAt?: string;
  submitted_at?: string | null;
  submittedAt?: string | null;
  status: AttemptStatus;
  score?: number | null;
  max_score?: number;
  maxScore?: number;
  balance_score?: number | null;
  balanceScore?: number | null;
  verify_code?: string;
  verifyCode?: string;
  last_seen_at?: string;
  lastSeenAt?: string;
}

export interface SavedAnswerRecord {
  question_id?: string;
  questionId?: string;
  selected: string[] | string;
  marked?: boolean;
  client_seq?: number;
  clientSeq?: number;
  saved_at?: string;
  savedAt?: string;
  received_at?: string;
  receivedAt?: string;
  accepted?: boolean;
  reject_reason?: string | null;
  rejectReason?: string | null;
  hash?: string;
}

export interface StartAttemptResponse {
  attempt: AttemptSummary;
  questions: ClientSnapshotQuestion[];
  savedAnswers?: SavedAnswerRecord[];
  receipts?: SignedReceipt[];
  serverNow?: number | string;
  sessionToken?: string;
  exam?: ExamRecord;
}

export interface EnrollmentRecord {
  exam_id?: string;
  candidate_id?: string;
  status?: string;
  enrolled_at?: string;
  candidate?: Pick<AppUser, "id" | "name" | "email" | "role" | "active" | "class_name" | "section" | "phone">;
  user?: Pick<AppUser, "id" | "name" | "email" | "role" | "active" | "class_name" | "section" | "phone">;
  users?: Pick<AppUser, "id" | "name" | "email" | "role" | "active" | "class_name" | "section" | "phone">;
  email?: string;
  name?: string;
}

export interface FairnessReport {
  attemptsCount: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  spread: number | null;
  seedCommitment?: string | null;
  seedRevealed?: string | null;
  seedReveal?: string | null;
}

export interface MonitorAttemptRow {
  id: string;
  attemptId?: string;
  candidateId?: string;
  candidateName?: string;
  candidateEmail?: string;
  candidate?: { id: string; name: string; email: string };
  status: AttemptStatus;
  isSandbox?: boolean;
  is_sandbox?: boolean;
  answeredCount?: number;
  totalQuestions?: number;
  progress?: number | { answered: number; total: number };
  lastSeenAt?: string;
  last_seen_at?: string;
  startedAt?: string;
  started_at?: string;
  deadlineAt?: string;
  deadline_at?: string;
  score?: number | null;
  maxScore?: number;
  max_score?: number;
  pendingManualCount?: number;
  indicators?: Partial<IntegrityIndicators>;
  flagged?: boolean;
}

export interface AnnouncementRecord {
  id: string;
  exam_id?: string;
  examId?: string;
  message: string;
  at?: string;
  created_at?: string;
}

export interface MonitorResponse {
  attempts: MonitorAttemptRow[];
  flaggedQueue?: MonitorAttemptRow[];
  announcements?: AnnouncementRecord[];
}

export interface ExamAnalyticsResponse {
  examTitle?: string;
  className?: string | null;
  section?: string | null;
  summary: {
    avg: number | null;
    averageScore?: number;
    averagePct?: number;
    passRate: number | null;
    passRatePct?: number;
    distribution: Array<{ bucket?: string; label?: string; range?: string; count: number }>;
    totalSubmitted: number;
  };
  candidates: Array<{
    attemptId?: string;
    id?: string;
    candidateId?: string;
    name?: string;
    email?: string;
    candidate?: { name: string; email: string; class_name?: string | null; section?: string | null };
    status: AttemptStatus;
    score: number | null;
    maxScore?: number;
    max_score?: number;
    totalQuestions?: number;
    correctCount?: number;
    wrongCount?: number;
    unansweredCount?: number;
    timeTakenMin?: number | null;
    pendingManualCount?: number;
    submittedAt?: string | null;
    submitted_at?: string | null;
    verifyCode?: string;
    verify_code?: string;
  }>;
  questionAnalytics: Array<{
    questionId?: string;
    id?: string;
    text?: string;
    type?: QuestionType;
    pctCorrect?: number;
    correctRate?: number;
    skipRate?: number;
    difficultyIndex?: number;
    mostCommonWrongOption?: string | null;
    ambiguityFlag?: boolean;
    possiblyAmbiguous?: boolean;
    ambiguityFlags?: string[];
  }>;
}

export interface AttemptGradeRecord {
  question_id?: string;
  questionId?: string;
  awarded: number | null;
  max_marks?: number;
  maxMarks?: number;
  feedback?: string | null;
  is_pending_manual?: boolean;
  isPendingManual?: boolean;
}

export interface ResultQuestionItem {
  id: string;
  type: QuestionType;
  difficulty?: 1 | 2 | 3;
  text: string;
  marks: number;
  options?: Array<{ id: string; text: string }>;
  correctOptionIds?: string[];
  correct_option_ids?: string[];
  explanation?: string | null;
  writtenRubric?: string | null;
  selected?: string[] | string;
  awarded?: number | null;
  feedback?: string | null;
  isPendingManual?: boolean;
}

export interface AttemptResultResponse {
  attempt: AttemptSummary;
  exam?: Partial<ExamRecord>;
  candidate?: { name?: string; email?: string; class_name?: string | null; section?: string | null };
  grades?: AttemptGradeRecord[];
  questionsWithExplanations?: ResultQuestionItem[];
  questions?: ResultQuestionItem[];
  breakdown?: ResultQuestionItem[];
  summary?: {
    totalQuestions: number;
    attemptedCount: number;
    correctCount: number;
    wrongCount: number;
    unansweredCount: number;
    percentage: number;
    timeTakenMin: number | null;
  };
  savedAnswers?: SavedAnswerRecord[];
  receipts?: SignedReceipt[];
  verifyCode?: string;
}

export interface DisputeRecord {
  id: string;
  attempt_id?: string;
  attemptId?: string;
  question_id?: string | null;
  questionId?: string | null;
  type: DisputeType;
  reason: string;
  status: DisputeStatus;
  resolution?: string | null;
  resolver_id?: string | null;
  created_at?: string;
  createdAt?: string;
  resolved_at?: string | null;
  resolvedAt?: string | null;
  candidate?: { name: string; email: string };
  exam?: { id: string; title: string };
}

export interface EvidenceTimelineItem {
  at: string;
  kind?: string;
  type: string;
  summary?: string;
  meta?: Record<string, unknown>;
  hash?: string;
}

export interface DisputeDetailResponse {
  dispute: DisputeRecord;
  evidenceTimeline: EvidenceTimelineItem[];
  answer?: SavedAnswerRecord | null;
  key?: {
    correctOptionIds?: string[];
    correct_option_ids?: string[];
    writtenRubric?: string | null;
    written_rubric?: string | null;
    explanation?: string | null;
    questionText?: string;
    marks?: number;
  } | null;
  receipts?: SignedReceipt[];
}

export interface PublicVerifyCodeResponse {
  examTitle: string;
  maskedName: string;
  scoreBand: string;
  issuedAt: string;
  chainValid: boolean;
  recordCount: number;
  verifyCode: string;
  attemptId?: string;
  examId?: string;
}

export interface PublicVerifyAttemptResponse {
  attemptId: string;
  answersChain: ChainVerificationResult;
  eventsChain: ChainVerificationResult;
  lockEventsChain: ChainVerificationResult;
  valid: boolean;
}

export interface PublicVerifyExamResponse {
  examTitle: string;
  seedCommitment?: string | null;
  seedReveal?: string | null;
  checkpointHash?: string | null;
  checkpointValid?: boolean;
  attemptsChecked: number;
  allChainsValid: boolean;
}

export interface BulkImportResponse {
  created: number;
  enrolled?: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
}

// --- Field Normalizer Helpers (handles snake_case from Supabase & camelCase DTOs) ---

export function examStartAt(e: Partial<ExamRecord>): string {
  return e.start_at ?? e.startAt ?? "";
}

export function examEndAt(e: Partial<ExamRecord>): string {
  return e.end_at ?? e.endAt ?? "";
}

export function examDurationMin(e: Partial<ExamRecord>): number {
  return Number(e.duration_min ?? e.durationMin ?? 60);
}

export function examTotalMarks(e: Partial<ExamRecord>): number {
  return Number(e.total_marks ?? e.totalMarks ?? 0);
}

export function examResultsPublished(e: Partial<ExamRecord>): boolean {
  return Boolean(e.results_published ?? e.resultsPublished ?? false);
}

export function examGraceSec(e: Partial<ExamRecord>): number {
  return Number(e.grace_sec ?? e.graceSec ?? 15);
}

export function attemptDeadlineAt(a: Partial<AttemptSummary>): string {
  return a.deadline_at ?? a.deadlineAt ?? "";
}

export function attemptVerifyCode(a: Partial<AttemptSummary>): string {
  return a.verify_code ?? a.verifyCode ?? "";
}

export function attemptMaxScore(a: Partial<AttemptSummary>): number {
  return Number(a.max_score ?? a.maxScore ?? 0);
}

export function computeClientLifecycle(e: Partial<ExamRecord>, nowMs = Date.now()): ComputedExamLifecycle {
  if (e.lifecycle) return e.lifecycle;
  if (e.status === "DRAFT") return "DRAFT";
  const start = new Date(examStartAt(e)).getTime();
  const end = new Date(examEndAt(e)).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "PUBLISHED";
  if (nowMs < start) return "PUBLISHED";
  if (nowMs <= end) return "ONGOING";
  return "COMPLETED";
}
