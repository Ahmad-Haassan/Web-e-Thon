import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const workspacePrefsSchema = z.object({
  fontSize: z.enum(["sm", "md", "lg", "xl"]).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  highContrast: z.boolean().optional(),
  palettePosition: z.enum(["left", "right", "bottom"]).optional(),
  splitLayout: z.boolean().optional(),
});

// Admin User CRUD
export const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(["ADMIN", "EXAMINER", "CANDIDATE"]),
  invite: z.boolean().optional().default(false),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  role: z.enum(["ADMIN", "EXAMINER", "CANDIDATE"]).optional(),
  active: z.boolean().optional(),
});

// Categories
export const createCategorySchema = z.object({
  name: z.string().min(2).max(80).trim(),
});

// Questions
export const questionOptionInputSchema = z.object({
  text: z.string().min(1).max(1000),
  isCorrect: z.boolean(),
});

export const createQuestionSchema = z
  .object({
    categoryId: z.string().uuid().nullable().optional(),
    type: z.enum(["SINGLE", "MULTI", "WRITTEN"]),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    text: z.string().min(3).max(5000),
    marks: z.number().positive().max(1000),
    negativeMarking: z.number().min(0).max(1000).optional().default(0),
    explanation: z.string().max(3000).nullable().optional(),
    writtenRubric: z.string().max(3000).nullable().optional(),
    options: z.array(questionOptionInputSchema).optional().default([]),
  })
  .refine(
    (q) => {
      if (q.type === "WRITTEN") return true;
      if (q.options.length < 2) return false;
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      return q.type === "SINGLE" ? correctCount === 1 : correctCount >= 1;
    },
    { message: "SINGLE requires >=2 options with exactly 1 correct; MULTI requires >=2 options with >=1 correct" }
  );

export const updateQuestionSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  type: z.enum(["SINGLE", "MULTI", "WRITTEN"]).optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  text: z.string().min(3).max(5000).optional(),
  marks: z.number().positive().max(1000).optional(),
  negativeMarking: z.number().min(0).max(1000).optional(),
  explanation: z.string().max(3000).nullable().optional(),
  writtenRubric: z.string().max(3000).nullable().optional(),
  options: z.array(questionOptionInputSchema).optional(),
});

// Exams
export const blueprintRuleSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  count: z.number().int().positive(),
});

export const createExamSchema = z
  .object({
    title: z.string().min(3).max(200),
    instructions: z.string().max(5000).optional().default(""),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    durationMin: z.number().int().positive().max(600),
    shuffleQuestions: z.boolean().optional().default(true),
    shuffleOptions: z.boolean().optional().default(true),
    blueprint: z.array(blueprintRuleSchema).nullable().optional(),
    graceSec: z.number().int().min(0).max(300).optional().default(15),
    partialCreditConfig: z
      .object({
        enabled: z.boolean(),
        wrongPenalty: z.boolean(),
      })
      .optional()
      .default({ enabled: true, wrongPenalty: true }),
    perQuestionTimerSec: z.number().int().positive().nullable().optional(),
    noBacktrack: z.boolean().optional().default(false),
    questions: z
      .array(
        z.object({
          questionId: z.string().uuid(),
          marks: z.number().positive(),
          orderIndex: z.number().int().min(0).optional(),
        })
      )
      .optional(),
  })
  .refine((e) => new Date(e.endAt) > new Date(e.startAt), {
    message: "endAt must be after startAt",
  });

export const updateExamSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  instructions: z.string().max(5000).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  durationMin: z.number().int().positive().max(600).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  blueprint: z.array(blueprintRuleSchema).nullable().optional(),
  resultsPublished: z.boolean().optional(),
  graceSec: z.number().int().min(0).max(300).optional(),
  partialCreditConfig: z
    .object({ enabled: z.boolean(), wrongPenalty: z.boolean() })
    .optional(),
  perQuestionTimerSec: z.number().int().positive().nullable().optional(),
  noBacktrack: z.boolean().optional(),
  revealSeed: z.boolean().optional(),
  questions: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        marks: z.number().positive(),
        orderIndex: z.number().int().min(0).optional(),
      })
    )
    .optional(),
});

// Enrollments
export const enrollSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(500),
});

// Attempts & Offline Answer Sync
export const startAttemptSchema = z.object({
  isSandbox: z.boolean().optional().default(false),
  integrityAck: z.boolean().optional().default(true),
});

export const answerItemSchema = z.object({
  questionId: z.string().uuid(),
  selected: z.union([z.array(z.string()), z.string()]),
  marked: z.boolean().optional().default(false),
  clientSeq: z.number().int().positive(),
  savedAt: z.string().datetime(),
});

export const syncAnswersSchema = z.object({
  answers: z.array(answerItemSchema).min(1).max(100),
  sessionToken: z.string().optional(),
});

// Events & Integrity
export const logEventSchema = z.object({
  type: z.enum([
    "TAB_BLUR",
    "FULLSCREEN_EXIT",
    "PASTE",
    "COPY_ATTEMPT",
    "DISCONNECT",
    "RECONNECT",
    "SAVE",
    "TECHNICAL_INCIDENT",
    "FAST_ANSWER",
  ]),
  meta: z.record(z.string(), z.unknown()).optional().default({}),
  at: z.string().datetime().optional(),
});

export const logLockEventSchema = z.object({
  type: z.enum(["LOCK", "VIOLATION", "UNLOCK", "RESUME"]),
  meta: z.record(z.string(), z.unknown()).optional().default({}),
});

export const createUnlockCodeSchema = z.object({
  reason: z.string().min(3).max(500),
  expiresInSec: z.number().int().min(30).max(600).optional().default(120),
  grantExtraSec: z.number().int().min(0).max(3600).optional().default(0),
});

export const redeemUnlockCodeSchema = z.object({
  code: z.string().min(4).max(32).trim(),
});

// Manual Grading
export const manualGradeSchema = z.object({
  questionId: z.string().uuid(),
  awarded: z.number().min(0),
  feedback: z.string().max(2000).optional().default(""),
});

// Announcements
export const createAnnouncementSchema = z.object({
  message: z.string().min(1).max(1000),
});

// Disputes
export const createDisputeSchema = z.object({
  attemptId: z.string().uuid(),
  questionId: z.string().uuid().nullable().optional(),
  type: z.enum(["GRADING", "AMBIGUOUS", "TECHNICAL"]),
  reason: z.string().min(5).max(2000),
});

export const resolveDisputeSchema = z.object({
  status: z.enum(["REJECTED", "REGRADED", "AMBIGUOUS_ACCEPTED", "TECHNICAL_REMEDY"]),
  resolution: z.string().min(3).max(2000),
  newAwarded: z.number().min(0).optional(), // used when status === 'REGRADED'
});

// Scratchpad
export const saveScratchpadSchema = z.object({
  textContent: z.string().max(50000).optional().default(""),
  drawingJson: z.array(z.unknown()).optional().default([]),
});

// Bulk Import
export const bulkImportCandidatesSchema = z.object({
  csv: z.string().optional(),
  rows: z
    .array(
      z.object({
        name: z.string().optional(),
        email: z.string(),
        password: z.string().optional(),
      })
    )
    .optional(),
  examId: z.string().uuid().optional(),
});

export const bulkImportQuestionsSchema = z.object({
  csv: z.string().optional(),
  rows: z.array(z.record(z.string(), z.unknown())).optional(),
});
