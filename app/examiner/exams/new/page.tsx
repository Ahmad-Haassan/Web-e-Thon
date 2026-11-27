"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ListChecks,
  Plus,
  PlusCircle,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  Label,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import type { BlueprintRule } from "@/lib/client/api-types";
import { createExamSchema } from "@/lib/shared/schemas";

interface InlineMcqDraft {
  text: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  marks: number;
  difficulty: 1 | 2 | 3;
}

const DEFAULT_CLASSES = ["IX", "X", "XI", "XII", "BSCS-1", "BSCS-2", "BSCS-3", "BSCS-4", "BSSE-4"];

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NewExamStepperPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Details, Class/Section, & Rules
  const now = new Date();
  const defaultStart = new Date(now.getTime() + 5 * 60_000);
  const defaultEnd = new Date(now.getTime() + 2 * 60 * 60_000);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [autoEnrollClass, setAutoEnrollClass] = useState(true);
  const [instructions, setInstructions] = useState(
    "Answer all questions independently. Your responses are saved locally in IndexedDB and synced with cryptographic receipts. Stay in fullscreen; tab switches are logged as review indicators."
  );
  const [rules, setRules] = useState<string[]>([
    "Only one attempt is permitted per candidate.",
    "The countdown timer is synchronized with the server and will auto-submit at expiration.",
    "If your internet disconnects, keep answering—responses sync automatically when you reconnect.",
  ]);
  const [newRuleText, setNewRuleText] = useState("");

  const [startLocal, setStartLocal] = useState(toLocalDatetimeValue(defaultStart));
  const [endLocal, setEndLocal] = useState(toLocalDatetimeValue(defaultEnd));
  const [durationMin, setDurationMin] = useState("60");
  const [graceSec, setGraceSec] = useState("15");
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [partialEnabled, setPartialEnabled] = useState(true);
  const [wrongPenalty, setWrongPenalty] = useState(true);
  const [noBacktrack, setNoBacktrack] = useState(false);

  // Step 2: Attached Bank Questions, Inline Questions & Blueprint
  const [selectedQuestions, setSelectedQuestions] = useState<Record<string, number>>({});
  const [inlineQuestions, setInlineQuestions] = useState<InlineMcqDraft[]>([]);
  const [qText, setQText] = useState("");
  const [qOpt0, setQOpt0] = useState("");
  const [qOpt1, setQOpt1] = useState("");
  const [qOpt2, setQOpt2] = useState("");
  const [qOpt3, setQOpt3] = useState("");
  const [qCorrect, setQCorrect] = useState<0 | 1 | 2 | 3>(0);
  const [qMarks, setQMarks] = useState("1");
  const [qDiff, setQDiff] = useState<1 | 2 | 3>(2);

  const [useBlueprint, setUseBlueprint] = useState(false);
  const [blueprint, setBlueprint] = useState<BlueprintRule[]>([
    { categoryId: null, difficulty: 1, count: 2 },
    { categoryId: null, difficulty: 2, count: 2 },
    { categoryId: null, difficulty: 3, count: 1 },
  ]);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.categories.list(),
  });

  const classesQuery = useQuery({
    queryKey: ["registered-classes"],
    queryFn: () => api.classes.list(),
  });

  const questionsQuery = useQuery({
    queryKey: ["questions-all"],
    queryFn: () => api.questions.list(),
  });

  const createExamMut = useMutation({
    mutationFn: api.exams.create,
    onSuccess: (res) => {
      toast.success("Exam created with cryptographic seed commitment");
      router.push(`/examiner/exams/${res.exam.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const questions = questionsQuery.data?.questions ?? [];
  const categories = categoriesQuery.data?.categories ?? [];
  const classOptions = Array.from(
    new Set([
      ...(classesQuery.data?.classes ?? []).map((c) => c.className),
      ...DEFAULT_CLASSES,
    ])
  );

  function addRule() {
    const val = newRuleText.trim();
    if (!val) return;
    setRules((prev) => [...prev, val]);
    setNewRuleText("");
  }

  function addInlineQuestion() {
    if (qText.trim().length < 3) {
      toast.error("Enter a question statement (at least 3 characters)");
      return;
    }
    const opts: [string, string, string, string] = [
      qOpt0.trim(),
      qOpt1.trim(),
      qOpt2.trim(),
      qOpt3.trim(),
    ];
    if (opts.some((o) => !o)) {
      toast.error("Please fill in all 4 answer options");
      return;
    }
    const marksNum = Math.max(0.5, Number(qMarks) || 1);
    setInlineQuestions((prev) => [
      ...prev,
      {
        text: qText.trim(),
        options: opts,
        correctIndex: qCorrect,
        marks: marksNum,
        difficulty: qDiff,
      },
    ]);
    setQText("");
    setQOpt0("");
    setQOpt1("");
    setQOpt2("");
    setQOpt3("");
    setQCorrect(0);
    setQMarks("1");
    toast.success("Question added to exam draft");
  }

  function toggleQuestion(id: string, defaultMarks: number) {
    setSelectedQuestions((prev) => {
      const next = { ...prev };
      if (next[id] !== undefined) {
        delete next[id];
      } else {
        next[id] = Number(defaultMarks) || 1;
      }
      return next;
    });
  }

  function handleSubmit() {
    const startIso = new Date(startLocal).toISOString();
    const endIso = new Date(endLocal).toISOString();

    const attached = Object.entries(selectedQuestions).map(([questionId, marks], idx) => ({
      questionId,
      marks,
      orderIndex: idx,
    }));

    const formattedInline = inlineQuestions.map((iq) => ({
      type: "SINGLE" as const,
      difficulty: iq.difficulty,
      text: iq.text,
      marks: iq.marks,
      negativeMarking: 0,
      options: iq.options.map((text, idx) => ({
        text,
        isCorrect: idx === iq.correctIndex,
      })),
    }));

    const payload = {
      title: title.trim(),
      category: category.trim() || null,
      className: className.trim() || null,
      section: section.trim() || null,
      rules: rules.map((r) => r.trim()).filter(Boolean),
      autoEnrollClass: Boolean(className.trim()) && autoEnrollClass,
      instructions: instructions.trim(),
      startAt: startIso,
      endAt: endIso,
      durationMin: Number(durationMin),
      graceSec: Number(graceSec || 15),
      shuffleQuestions,
      shuffleOptions,
      noBacktrack,
      partialCreditConfig: {
        enabled: partialEnabled,
        wrongPenalty,
      },
      blueprint: useBlueprint ? blueprint.filter((r) => r.count > 0) : null,
      questions: attached.length > 0 ? attached : undefined,
      inlineQuestions: formattedInline.length > 0 ? formattedInline : undefined,
    };

    const parsed = createExamSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please review exam configuration");
      return;
    }

    createExamMut.mutate(parsed.data);
  }

  const totalSelectedMarks =
    Object.values(selectedQuestions).reduce((s, m) => s + m, 0) +
    inlineQuestions.reduce((s, q) => s + q.marks, 0);
  const totalQuestionCount = Object.keys(selectedQuestions).length + inlineQuestions.length;

  return (
    <AppShell
      allowedRoles={["ADMIN", "EXAMINER"]}
      title="Create Examination"
      subtitle="Configure timing, class assignment, test rules, inline or bank questions, and review before saving as Draft."
    >
      {/* Stepper Header */}
      <ol className="mb-6 grid grid-cols-3 gap-2">
        {[
          { num: 1 as const, label: "1. Schedule, Class & Rules" },
          { num: 2 as const, label: "2. Questions & Blueprint" },
          { num: 3 as const, label: "3. Review & Commit" },
        ].map((s) => (
          <li key={s.num}>
            <button
              type="button"
              onClick={() => setStep(s.num)}
              className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                step === s.num
                  ? "border-accent bg-accent-soft text-accent"
                  : step > s.num
                  ? "border-verified/40 bg-verified-soft text-verified"
                  : "border-border bg-surface text-ink-muted"
              }`}
            >
              {step > s.num && <Check className="h-3.5 w-3.5" />}
              {s.label}
            </button>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Exam Details, Target Class &amp; Rules</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="ex-title">Exam Title</Label>
                <Input
                  id="ex-title"
                  required
                  placeholder="CS-301 Data Structures Midterm — Fall 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ex-category">Subject / Category (optional)</Label>
                <Input
                  id="ex-category"
                  list="ex-cat-list"
                  placeholder="e.g. Computer Science, Mathematics"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
                <datalist id="ex-cat-list">
                  {categories.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Target Class & Section (EMS workflow) */}
            <div className="grid gap-4 sm:grid-cols-3 items-end rounded-xl border border-border bg-surface-subtle p-3.5">
              <div>
                <Label htmlFor="ex-class">Assign to Class (optional)</Label>
                <Input
                  id="ex-class"
                  list="ex-class-list"
                  placeholder="e.g. IX or BSCS-4"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                />
                <datalist id="ex-class-list">
                  {classOptions.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <Label htmlFor="ex-section">Section (optional)</Label>
                <Select
                  id="ex-section"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                >
                  <option value="">All Sections</option>
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                  <option value="D">Section D</option>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={autoEnrollClass}
                  disabled={!className.trim()}
                  onChange={(e) => setAutoEnrollClass(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                <span>Auto-enroll registered students in this Class</span>
              </label>
            </div>

            <div>
              <Label htmlFor="ex-inst">General Instructions</Label>
              <Textarea
                id="ex-inst"
                rows={2}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>

            {/* Dynamic Structured Test Rules (EMS CreateTest/Rules.js) */}
            <div className="space-y-2.5 rounded-xl border border-border bg-surface-subtle p-4">
              <div className="flex items-center justify-between">
                <Label className="mb-0 flex items-center gap-1.5">
                  <ListChecks className="h-4 w-4 text-accent" />
                  Test Rules Shown on Pre-Exam Briefing ({rules.length})
                </Label>
              </div>
              {rules.length > 0 && (
                <ul className="space-y-1.5">
                  {rules.map((rule, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs"
                    >
                      <span className="text-foreground">
                        <strong className="text-accent mr-1.5">{idx + 1}.</strong>
                        {rule}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRules((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-danger hover:opacity-80 shrink-0 cursor-pointer"
                        aria-label={`Remove rule ${idx + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Add a rule (e.g. No calculators allowed, Do not switch tabs)…"
                  value={newRuleText}
                  onChange={(e) => setNewRuleText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addRule();
                    }
                  }}
                />
                <Button type="button" variant="secondary" onClick={addRule}>
                  <Plus className="h-4 w-4" /> Add Rule
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label htmlFor="ex-start">Window Opens</Label>
                <Input
                  id="ex-start"
                  type="datetime-local"
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ex-end">Window Closes</Label>
                <Input
                  id="ex-end"
                  type="datetime-local"
                  value={endLocal}
                  onChange={(e) => setEndLocal(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ex-dur">Duration (minutes)</Label>
                <Input
                  id="ex-dur"
                  type="number"
                  min={1}
                  max={600}
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ex-grace">Network Grace Window (sec)</Label>
                <Input
                  id="ex-grace"
                  type="number"
                  min={0}
                  max={300}
                  value={graceSec}
                  onChange={(e) => setGraceSec(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 pt-2">
              <label className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-subtle p-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                <span>Shuffle question order per candidate</span>
              </label>
              <label className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-subtle p-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={shuffleOptions}
                  onChange={(e) => setShuffleOptions(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                <span>Shuffle option order per candidate</span>
              </label>
              <label className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-subtle p-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={partialEnabled}
                  onChange={(e) => setPartialEnabled(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                <span>Enable multi-select partial credit (+correct/n)</span>
              </label>
              <label className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-subtle p-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={wrongPenalty}
                  onChange={(e) => setWrongPenalty(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                <span>Deduct wrong multi-select choices (−wrong/n, min 0)</span>
              </label>
              <label className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-subtle p-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={noBacktrack}
                  onChange={(e) => setNoBacktrack(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                <span>No-backtrack mode (one-way progression)</span>
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => {
                  if (title.trim().length < 3) {
                    toast.error("Please enter an exam title (min 3 characters)");
                    return;
                  }
                  if (new Date(endLocal) <= new Date(startLocal)) {
                    toast.error("Exam closing time must be after opening time");
                    return;
                  }
                  setStep(2);
                }}
              >
                Next: Questions &amp; Blueprint <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-5">
          {/* Quick Inline MCQ Builder (EMS CreateTest/Questions.js workflow) */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <PlusCircle className="h-4.5 w-4.5 text-accent" />
                    Add Questions Directly ({inlineQuestions.length} added)
                  </h2>
                  <p className="text-xs text-ink-muted">
                    Quickly author 4-option MCQs right here. They will be saved to your Question Bank and attached automatically.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {inlineQuestions.length > 0 && (
                <div className="space-y-2">
                  {inlineQuestions.map((iq, idx) => (
                    <div
                      key={idx}
                      className="flex items-start justify-between gap-3 rounded-lg border border-verified/30 bg-verified-soft/40 p-3 text-xs"
                    >
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground text-sm">
                          #{idx + 1}. {iq.text}
                        </p>
                        <div className="flex flex-wrap gap-1.5 text-ink-muted">
                          {iq.options.map((o, oi) => (
                            <span
                              key={oi}
                              className={`rounded px-2 py-0.5 border ${
                                oi === iq.correctIndex
                                  ? "border-verified bg-verified-soft text-verified font-semibold"
                                  : "border-border bg-surface"
                              }`}
                            >
                              {String.fromCharCode(65 + oi)}. {o}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge tone="neutral">{iq.marks} pts</Badge>
                        <button
                          type="button"
                          onClick={() =>
                            setInlineQuestions((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-danger hover:opacity-80 cursor-pointer"
                          aria-label={`Remove inline question ${idx + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3 rounded-xl border border-border bg-surface-subtle p-4">
                <div>
                  <Label htmlFor="iq-text">Question Statement</Label>
                  <Input
                    id="iq-text"
                    placeholder="e.g. What is the worst-case time complexity of Binary Search?"
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                  />
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Input
                    placeholder="Option A"
                    value={qOpt0}
                    onChange={(e) => setQOpt0(e.target.value)}
                  />
                  <Input
                    placeholder="Option B"
                    value={qOpt1}
                    onChange={(e) => setQOpt1(e.target.value)}
                  />
                  <Input
                    placeholder="Option C"
                    value={qOpt2}
                    onChange={(e) => setQOpt2(e.target.value)}
                  />
                  <Input
                    placeholder="Option D"
                    value={qOpt3}
                    onChange={(e) => setQOpt3(e.target.value)}
                  />
                </div>
                <div className="grid gap-2.5 sm:grid-cols-4 items-end">
                  <div>
                    <Label htmlFor="iq-ans">Correct Option</Label>
                    <Select
                      id="iq-ans"
                      value={qCorrect}
                      onChange={(e) => setQCorrect(Number(e.target.value) as 0 | 1 | 2 | 3)}
                    >
                      <option value={0}>Option A</option>
                      <option value={1}>Option B</option>
                      <option value={2}>Option C</option>
                      <option value={3}>Option D</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="iq-diff">Difficulty</Label>
                    <Select
                      id="iq-diff"
                      value={qDiff}
                      onChange={(e) => setQDiff(Number(e.target.value) as 1 | 2 | 3)}
                    >
                      <option value={1}>Easy (1)</option>
                      <option value={2}>Medium (2)</option>
                      <option value={3}>Hard (3)</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="iq-marks">Marks</Label>
                    <Input
                      id="iq-marks"
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={qMarks}
                      onChange={(e) => setQMarks(e.target.value)}
                    />
                  </div>
                  <Button type="button" variant="secondary" onClick={addInlineQuestion}>
                    <Plus className="h-4 w-4" /> Add Question
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fair Randomization Blueprint */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold">Fair Randomization Blueprint (Optional)</h2>
                  <p className="text-xs text-ink-muted">
                    Define exact difficulty/category quotas so every student receives an equally balanced paper drawn deterministically from a committed seed.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useBlueprint}
                    onChange={(e) => setUseBlueprint(e.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  Enable Blueprint
                </label>
              </div>
            </CardHeader>

            {useBlueprint && (
              <CardContent className="space-y-3">
                {blueprint.map((rule, idx) => (
                  <div key={idx} className="grid gap-2.5 sm:grid-cols-4 items-end">
                    <div>
                      <Label>Category</Label>
                      <Select
                        value={rule.categoryId ?? ""}
                        onChange={(e) =>
                          setBlueprint((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, categoryId: e.target.value || null } : r
                            )
                          )
                        }
                      >
                        <option value="">Any Category</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>Difficulty</Label>
                      <Select
                        value={rule.difficulty}
                        onChange={(e) =>
                          setBlueprint((prev) =>
                            prev.map((r, i) =>
                              i === idx
                                ? { ...r, difficulty: Number(e.target.value) as 1 | 2 | 3 }
                                : r
                            )
                          )
                        }
                      >
                        <option value={1}>Easy (1)</option>
                        <option value={2}>Medium (2)</option>
                        <option value={3}>Hard (3)</option>
                      </Select>
                    </div>
                    <div>
                      <Label>Question Count</Label>
                      <Input
                        type="number"
                        min={1}
                        value={rule.count}
                        onChange={(e) =>
                          setBlueprint((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, count: Math.max(1, Number(e.target.value)) } : r
                            )
                          )
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setBlueprint((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4 text-danger" /> Remove
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setBlueprint((prev) => [
                      ...prev,
                      { categoryId: null, difficulty: 2, count: 1 },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Add Quota Rule
                </Button>
              </CardContent>
            )}
          </Card>

          {/* Question Pool Selection */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">Attach Existing Questions from Bank</h2>
                  <p className="text-xs text-ink-muted">
                    Total Paper: <strong>{totalQuestionCount}</strong> question(s) ({Object.keys(selectedQuestions).length} bank + {inlineQuestions.length} inline) ·{" "}
                    <strong>{totalSelectedMarks}</strong> total marks
                  </p>
                </div>
                {questions.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const all: Record<string, number> = {};
                      for (const q of questions) all[q.id] = Number(q.marks) || 1;
                      setSelectedQuestions(all);
                    }}
                  >
                    Select All ({questions.length})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {questionsQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-ink-muted">
                  <Spinner /> Loading questions…
                </div>
              ) : questions.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  No existing questions in the Question Bank yet. You can use the quick inline question builder above or add questions later.
                </p>
              ) : (
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {questions.map((q) => {
                    const checked = selectedQuestions[q.id] !== undefined;
                    return (
                      <div
                        key={q.id}
                        className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors ${
                          checked
                            ? "border-accent bg-accent-soft/40"
                            : "border-border bg-surface-subtle"
                        }`}
                      >
                        <label className="flex items-start gap-3 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleQuestion(q.id, q.marks)}
                            className="mt-1 h-4 w-4 accent-accent"
                          />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">{q.text}</p>
                            <div className="flex items-center gap-1.5">
                              <Badge tone="neutral">{q.type}</Badge>
                              <Badge tone="neutral">Diff {q.difficulty}</Badge>
                            </div>
                          </div>
                        </label>
                        {checked && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs text-ink-muted">Marks:</span>
                            <Input
                              type="number"
                              min={0.5}
                              step={0.5}
                              value={selectedQuestions[q.id]}
                              onChange={(e) =>
                                setSelectedQuestions((prev) => ({
                                  ...prev,
                                  [q.id]: Math.max(0.5, Number(e.target.value)),
                                }))
                              }
                              className="h-8 w-20 text-xs"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-5 flex justify-between">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button onClick={() => setStep(3)}>
                  Next: Review &amp; Commit <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Pre-Publication Review</h2>
            <p className="text-xs text-ink-muted">
              Creating this exam generates a cryptographic SHA-256 seed commitment so paper generation can be audited after completion.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 rounded-xl border border-border bg-surface-subtle p-4 text-sm">
              <div>
                <p className="text-xs text-ink-subtle uppercase font-semibold">Title &amp; Category</p>
                <p className="font-medium">
                  {title}
                  {category ? ` (${category})` : ""}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle uppercase font-semibold">Target Class &amp; Rules</p>
                <p>
                  {className
                    ? `Class ${className}${section ? ` · Sec ${section}` : ""}${
                        autoEnrollClass ? " (Auto-enroll ON)" : ""
                      }`
                    : "Manual enrollment"}
                  {" · "}
                  {rules.length} rule(s)
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle uppercase font-semibold">Schedule Window</p>
                <p>
                  {new Date(startLocal).toLocaleString()} → {new Date(endLocal).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle uppercase font-semibold">Question Paper &amp; Duration</p>
                <p>
                  {totalQuestionCount} question(s) ({totalSelectedMarks} pts) · {durationMin} min (+{graceSec}s grace)
                  {useBlueprint ? ` · Blueprint (${blueprint.length} rules)` : ""}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-lg border border-verified/30 bg-verified-soft p-3.5 text-xs text-verified">
              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                The exam will be saved as <strong>DRAFT</strong>. On the next screen you can review enrollments, preview in Sandbox mode, and click <strong>Publish Exam</strong> when ready.
              </span>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="secondary" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button onClick={handleSubmit} disabled={createExamMut.isPending}>
                {createExamMut.isPending ? <Spinner /> : "Create Exam (Draft)"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
