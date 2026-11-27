import type { BlueprintRule } from "@/lib/client/api-types";

export type ExaminerTab =
  | "dashboard"
  | "create"
  | "questions"
  | "exams"
  | "monitor"
  | "results"
  | "analytics"
  | "settings";

export interface ExamTemplate {
  id: string;
  name: string;
  badge: string;
  description: string;
  durationMin: number;
  graceSec: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  partialEnabled: boolean;
  wrongPenalty: boolean;
  noBacktrack: boolean;
  instructions: string;
  useBlueprint: boolean;
  blueprint: BlueprintRule[];
}

export const EXAM_TEMPLATES: ExamTemplate[] = [
  {
    id: "midterm",
    name: "Standard Midterm Exam",
    badge: "Balanced · 90 min",
    description:
      "Fair difficulty blueprint with shuffled questions & options, partial credit enabled, and 15s offline sync grace.",
    durationMin: 90,
    graceSec: 15,
    shuffleQuestions: true,
    shuffleOptions: true,
    partialEnabled: true,
    wrongPenalty: true,
    noBacktrack: false,
    instructions:
      "Answer all questions independently. Your responses are saved locally in IndexedDB and synced with cryptographic SHA-256 receipts. Stay in fullscreen during the session.",
    useBlueprint: true,
    blueprint: [
      { categoryId: null, difficulty: 1, count: 3 },
      { categoryId: null, difficulty: 2, count: 3 },
      { categoryId: null, difficulty: 3, count: 2 },
    ],
  },
  {
    id: "quiz",
    name: "Quick Timed Quiz",
    badge: "Fast · 30 min",
    description:
      "Short formative checkpoint with per-candidate option randomization and generous 20s network grace.",
    durationMin: 30,
    graceSec: 20,
    shuffleQuestions: true,
    shuffleOptions: true,
    partialEnabled: true,
    wrongPenalty: false,
    noBacktrack: false,
    instructions:
      "Complete this timed quiz within the scheduled window. Offline answers remain queued locally and sync automatically upon reconnect.",
    useBlueprint: false,
    blueprint: [{ categoryId: null, difficulty: 1, count: 5 }],
  },
  {
    id: "final",
    name: "High-Stakes Final Exam",
    badge: "Strict · 120 min",
    description:
      "Strict progression (no-backtrack option enabled), balanced difficulty quotas, and full cryptographic seed commitment.",
    durationMin: 120,
    graceSec: 30,
    shuffleQuestions: true,
    shuffleOptions: true,
    partialEnabled: true,
    wrongPenalty: true,
    noBacktrack: true,
    instructions:
      "Final Examination Policy: Questions advance sequentially without backtracking. All answers and session events are recorded in a tamper-evident hash chain.",
    useBlueprint: true,
    blueprint: [
      { categoryId: null, difficulty: 1, count: 4 },
      { categoryId: null, difficulty: 2, count: 4 },
      { categoryId: null, difficulty: 3, count: 3 },
    ],
  },
  {
    id: "written",
    name: "Written & Rubric Assessment",
    badge: "Manual Grading · 60 min",
    description:
      "Ideal for essay, architecture, and short-answer assessments graded against examiner rubrics.",
    durationMin: 60,
    graceSec: 30,
    shuffleQuestions: false,
    shuffleOptions: false,
    partialEnabled: false,
    wrongPenalty: false,
    noBacktrack: false,
    instructions:
      "Provide clear, structured written answers. Scratchpad notes are autosaved alongside your responses and hashed on submission.",
    useBlueprint: false,
    blueprint: [{ categoryId: null, difficulty: 2, count: 3 }],
  },
];
