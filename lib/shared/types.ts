export type UserRole = "ADMIN" | "EXAMINER" | "CANDIDATE";
export type QuestionType = "SINGLE" | "MULTI" | "WRITTEN";
export type ExamStatus = "DRAFT" | "PUBLISHED";
export type ComputedExamLifecycle = "DRAFT" | "PUBLISHED" | "ONGOING" | "COMPLETED";
export type AttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "EXPIRED" | "GRADED";
export type DisputeType = "GRADING" | "AMBIGUOUS" | "TECHNICAL";
export type DisputeStatus =
  | "OPEN"
  | "REJECTED"
  | "REGRADED"
  | "AMBIGUOUS_ACCEPTED"
  | "TECHNICAL_REMEDY";
export type LockEventType = "LOCK" | "VIOLATION" | "UNLOCK" | "RESUME";

export interface WorkspacePrefs {
  fontSize: "sm" | "md" | "lg" | "xl";
  theme: "light" | "dark" | "system";
  highContrast: boolean;
  palettePosition: "left" | "right" | "bottom";
  splitLayout: boolean;
}

export interface AppUser {
  id: string;
  supabase_user_id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  prefs: WorkspacePrefs;
}

export interface BlueprintRule {
  categoryId?: string | null;
  difficulty: 1 | 2 | 3;
  count: number;
}

export interface PartialCreditConfig {
  enabled: boolean;
  wrongPenalty: boolean;
}

export interface SnapshotOption {
  id: string;
  text: string;
}

/** Client-safe frozen question (NEVER contains correctOptionIds or writtenRubric). */
export interface ClientSnapshotQuestion {
  id: string;
  type: QuestionType;
  difficulty: 1 | 2 | 3;
  text: string;
  marks: number;
  negativeMarking: number;
  options: SnapshotOption[];
  categoryId?: string | null;
}

/** Server-only frozen question (stored inside attempts.paper_snapshot, stripped on response). */
export interface ServerSnapshotQuestion extends ClientSnapshotQuestion {
  correctOptionIds: string[];
  writtenRubric?: string | null;
  explanation?: string | null;
  historicalDifficultyIndex?: number | null;
}

export interface ServerPaperSnapshot {
  version: 1;
  examId: string;
  candidateId: string;
  seedUsed: string;
  generatedAt: string;
  questions: ServerSnapshotQuestion[];
  balanceScore: number;
  totalMarks: number;
}

export interface SignedReceipt {
  id?: string;
  attemptId: string;
  answerHash: string;
  clientSeq: number;
  serverTime: string;
  sig: string;
  accepted: boolean;
  rejectReason?: string | null;
}

export interface ChainVerificationResult {
  records: number;
  valid: boolean;
  brokenAt: number; // -1 if valid
  headHash: string | null;
}

export interface IntegrityIndicators {
  disclaimer: "Indicators are signals for examiner review, not proof of misconduct.";
  tabBlurs: number;
  fullscreenExits: number;
  pasteEvents: number;
  copyAttempts: number;
  disconnects: number;
  totalOfflineSec: number;
  lockViolations: number;
  emergencyUnlocks: number;
}
