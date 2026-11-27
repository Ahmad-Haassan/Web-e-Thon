"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  examDurationMin,
  examEndAt,
  examGraceSec,
  examStartAt,
  type BlueprintRule,
  type ExamRecord,
  type QuestionRecord,
} from "@/lib/client/api-types";
import { createExamSchema, updateExamSchema } from "@/lib/shared/schemas";
import { EXAM_TEMPLATES, type ExamTemplate } from "./examiner-types";

interface CreateExamPanelProps {
  initialTemplate?: ExamTemplate | null;
  editExamId?: string | null;
  onCancelEdit?: () => void;
  onApplyTemplate?: (tpl: ExamTemplate) => void;
  onSuccessExam?: (examId: string) => void;
}

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function safeLocalDatetimeFromIso(iso: string | undefined, fallback: Date): string {
  if (!iso) return toLocalDatetimeValue(fallback);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? toLocalDatetimeValue(fallback) : toLocalDatetimeValue(d);
}

interface FormInnerProps {
  initialTemplate?: ExamTemplate | null;
  existingExam?: ExamRecord | null;
  existingQuestions?: QuestionRecord[];
  onCancelEdit?: () => void;
  onApplyTemplate?: (tpl: ExamTemplate) => void;
  onSuccessExam?: (examId: string) => void;
}

function CreateExamFormInner({
  initialTemplate,
  existingExam,
  existingQuestions,
  onCancelEdit,
  onApplyTemplate,
  onSuccessExam,
}: FormInnerProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const isEditing = Boolean(existingExam);

  const [step, setStep] = useState<1 | 2 | 3>(1);

  const initialPc = existingExam?.partial_credit_config ?? existingExam?.partialCreditConfig;

  const [title, setTitle] = useState(
    existingExam?.title ?? (initialTemplate ? `${initialTemplate.name} — ` : "")
  );
  const [instructions, setInstructions] = useState(
    existingExam?.instructions ??
      initialTemplate?.instructions ??
      "Answer all questions independently. Your responses are saved locally in IndexedDB and synced with cryptographic receipts. Stay in fullscreen; tab switches are logged as review indicators."
  );
  const [startLocal, setStartLocal] = useState(() =>
    safeLocalDatetimeFromIso(
      existingExam ? examStartAt(existingExam) : undefined,
      new Date(Date.now() + 5 * 60_000)
    )
  );
  const [endLocal, setEndLocal] = useState(() =>
    safeLocalDatetimeFromIso(
      existingExam ? examEndAt(existingExam) : undefined,
      new Date(Date.now() + 2 * 60 * 60_000)
    )
  );
  const [durationMin, setDurationMin] = useState(
    String(
      existingExam ? examDurationMin(existingExam) : initialTemplate?.durationMin ?? 60
    )
  );
  const [graceSec, setGraceSec] = useState(
    String(existingExam ? examGraceSec(existingExam) : initialTemplate?.graceSec ?? 15)
  );
  const [shuffleQuestions, setShuffleQuestions] = useState(
    existingExam
      ? Boolean(existingExam.shuffle_questions ?? existingExam.shuffleQuestions ?? true)
      : initialTemplate?.shuffleQuestions ?? true
  );
  const [shuffleOptions, setShuffleOptions] = useState(
    existingExam
      ? Boolean(existingExam.shuffle_options ?? existingExam.shuffleOptions ?? true)
      : initialTemplate?.shuffleOptions ?? true
  );
  const [partialEnabled, setPartialEnabled] = useState(
    initialPc ? Boolean(initialPc.enabled) : initialTemplate?.partialEnabled ?? true
  );
  const [wrongPenalty, setWrongPenalty] = useState(
    initialPc ? Boolean(initialPc.wrongPenalty) : initialTemplate?.wrongPenalty ?? true
  );
  const [noBacktrack, setNoBacktrack] = useState(
    existingExam
      ? Boolean(existingExam.no_backtrack ?? existingExam.noBacktrack ?? false)
      : initialTemplate?.noBacktrack ?? false
  );

  // Step 2 state
  const [qSearch, setQSearch] = useState("");
  const [qCategoryFilter, setQCategoryFilter] = useState("");
  const [selectedQuestions, setSelectedQuestions] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const q of existingQuestions ?? []) {
      if (q.id) map[q.id] = Number(q.marks) || 1;
    }
    return map;
  });
  const [useBlueprint, setUseBlueprint] = useState(
    existingExam
      ? Array.isArray(existingExam.blueprint) && existingExam.blueprint.length > 0
      : initialTemplate?.useBlueprint ?? false
  );
  const [blueprint, setBlueprint] = useState<BlueprintRule[]>(
    existingExam?.blueprint && existingExam.blueprint.length > 0
      ? existingExam.blueprint
      : initialTemplate?.blueprint ?? [
          { categoryId: null, difficulty: 1, count: 2 },
          { categoryId: null, difficulty: 2, count: 2 },
          { categoryId: null, difficulty: 3, count: 1 },
        ]
  );

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.categories.list(),
  });

  const questionsQuery = useQuery({
    queryKey: ["questions-all"],
    queryFn: () => api.questions.list(),
  });

  const saveMut = useMutation({
    mutationFn: async ({
      payload,
      publishNow,
    }: {
      payload: Record<string, unknown>;
      publishNow: boolean;
    }) => {
      if (existingExam) {
        const updateBody = publishNow ? { ...payload, status: "PUBLISHED" } : payload;
        const res = await api.exams.update(existingExam.id, updateBody);
        return { exam: res.exam, published: publishNow };
      }
      const created = await api.exams.create(payload);
      if (publishNow) {
        const updated = await api.exams.update(created.exam.id, { status: "PUBLISHED" });
        return { exam: updated.exam, published: true };
      }
      return { exam: created.exam, published: false };
    },
    onSuccess: ({ exam, published }) => {
      toast.success(
        isEditing
          ? published
            ? "Exam updated and published!"
            : "Exam configuration updated"
          : published
            ? "Exam created & published with SHA-256 seed commitment"
            : "Exam created as Draft with SHA-256 seed commitment"
      );
      qc.invalidateQueries({ queryKey: ["examiner-overview"] });
      qc.invalidateQueries({ queryKey: ["examiner-exams"] });
      if (existingExam) {
        qc.invalidateQueries({ queryKey: ["exam-detail", existingExam.id] });
      }
      if (onSuccessExam) {
        onSuccessExam(exam.id);
      } else {
        router.push(`/examiner/exams/${exam.id}`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const allQuestions = useMemo(
    () => questionsQuery.data?.questions ?? [],
    [questionsQuery.data]
  );
  const categories = categoriesQuery.data?.categories ?? [];

  const filteredQuestions = useMemo(() => {
    const term = qSearch.trim().toLowerCase();
    return allQuestions.filter((q) => {
      const catId = q.categoryId ?? q.category_id ?? "";
      if (qCategoryFilter && catId !== qCategoryFilter) return false;
      if (term && !q.text.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [allQuestions, qSearch, qCategoryFilter]);

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

  function handleSave(publishNow: boolean) {
    const startDate = new Date(startLocal);
    const endDate = new Date(endLocal);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      toast.error("Provide valid start and end timestamps");
      return;
    }

    const attached = Object.entries(selectedQuestions).map(([questionId, marks], idx) => ({
      questionId,
      marks,
      orderIndex: idx,
    }));

    if (publishNow && attached.length === 0) {
      toast.error("Attach at least one question before publishing");
      return;
    }

    const payload = {
      title: title.trim(),
      instructions: instructions.trim(),
      startAt: startDate.toISOString(),
      endAt: endDate.toISOString(),
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
      questions: isEditing ? attached : attached.length > 0 ? attached : undefined,
    };

    if (isEditing) {
      const parsed = updateExamSchema.safeParse(payload);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Please check exam configuration");
        return;
      }
      if (endDate <= startDate) {
        toast.error("Exam closing time must be after opening time");
        return;
      }
      saveMut.mutate({ payload: parsed.data, publishNow });
    } else {
      const parsed = createExamSchema.safeParse(payload);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Please check exam configuration");
        return;
      }
      saveMut.mutate({ payload: parsed.data, publishNow });
    }
  }

  const attachedCount = Object.keys(selectedQuestions).length;
  const totalSelectedMarks = Object.values(selectedQuestions).reduce((s, m) => s + m, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Header & Template Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {isEditing ? `Edit Exam: ${existingExam?.title}` : "Create Examination"}
          </h1>
          <p className="text-sm text-ink-subtle">
            {isEditing
              ? "Update schedule, integrity policies, blueprint rules, or attached questions."
              : "Configure timing, fair randomization blueprint, and cryptographic seed commitment."}
          </p>
        </div>
        {isEditing && onCancelEdit && (
          <Button variant="secondary" size="sm" onClick={onCancelEdit}>
            Cancel Edit
          </Button>
        )}
      </div>

      {!isEditing && onApplyTemplate && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-blue-100 bg-surface p-3.5 shadow-2xs">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent mr-1">
            <Sparkles className="h-3.5 w-3.5" /> Quick Templates:
          </span>
          {EXAM_TEMPLATES.map((tpl) => {
            const active = initialTemplate?.id === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onApplyTemplate(tpl)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition cursor-pointer ${
                  active
                    ? "border-blue-600 bg-accent-soft text-accent"
                    : "border-border bg-surface-subtle text-ink-muted hover:border-blue-300 hover:text-foreground"
                }`}
              >
                {tpl.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Stepper Header */}
      <ol className="grid grid-cols-3 gap-2">
        {[
          { num: 1 as const, label: "1. Schedule & Policy" },
          { num: 2 as const, label: "2. Questions & Blueprint" },
          { num: 3 as const, label: "3. Review & Commit" },
        ].map((s) => (
          <li key={s.num}>
            <button
              type="button"
              onClick={() => setStep(s.num)}
              className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                step === s.num
                  ? "border-blue-600 bg-accent-soft text-accent"
                  : step > s.num
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-border bg-surface text-ink-subtle"
              }`}
            >
              {step > s.num && <Check className="h-3.5 w-3.5" />}
              {s.label}
            </button>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Card className="rounded-2xl border-border shadow-2xs">
          <CardHeader>
            <h2 className="text-base font-bold text-foreground">
              Exam Details &amp; Authoritative Timing
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="ex-title">Exam Title</Label>
              <Input
                id="ex-title"
                required
                placeholder="Data Structures Final Exam — Fall 2026"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="ex-inst">Candidate Instructions</Label>
              <Textarea
                id="ex-inst"
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
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

            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-surface-subtle p-3 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                  className="h-4 w-4 accent-blue-600"
                />
                <span>Shuffle question order per candidate</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-surface-subtle p-3 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={shuffleOptions}
                  onChange={(e) => setShuffleOptions(e.target.checked)}
                  className="h-4 w-4 accent-blue-600"
                />
                <span>Shuffle option order per candidate</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-surface-subtle p-3 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={partialEnabled}
                  onChange={(e) => setPartialEnabled(e.target.checked)}
                  className="h-4 w-4 accent-blue-600"
                />
                <span>Enable multi-select partial credit (+correct/n)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-surface-subtle p-3 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={wrongPenalty}
                  onChange={(e) => setWrongPenalty(e.target.checked)}
                  className="h-4 w-4 accent-blue-600"
                />
                <span>Deduct wrong multi-select choices (−wrong/n, min 0)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-surface-subtle p-3 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={noBacktrack}
                  onChange={(e) => setNoBacktrack(e.target.checked)}
                  className="h-4 w-4 accent-blue-600"
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
          {/* Fair Randomization Blueprint */}
          <Card className="rounded-2xl border-border shadow-2xs">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Fair Randomization Blueprint (Optional)
                  </h2>
                  <p className="text-xs text-ink-subtle">
                    Define exact difficulty/category quotas so every student receives an equally balanced paper drawn from a committed SHA-256 seed.
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink-muted shrink-0">
                  <input
                    type="checkbox"
                    checked={useBlueprint}
                    onChange={(e) => setUseBlueprint(e.target.checked)}
                    className="h-4 w-4 accent-blue-600"
                  />
                  Enable Blueprint
                </label>
              </div>
            </CardHeader>

            {useBlueprint && (
              <CardContent className="space-y-3">
                {blueprint.map((rule, idx) => (
                  <div key={idx} className="grid items-end gap-2.5 sm:grid-cols-4">
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
                              i === idx
                                ? { ...r, count: Math.max(1, Number(e.target.value)) }
                                : r
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
                      <Trash2 className="h-4 w-4 text-rose-600" /> Remove
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
          <Card className="rounded-2xl border-border shadow-2xs">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Attach Questions from Bank
                  </h2>
                  <p className="text-xs text-ink-subtle">
                    Selected: <strong>{attachedCount}</strong> question(s) ·{" "}
                    <strong>{totalSelectedMarks}</strong> total marks
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {allQuestions.length > 0 && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const all: Record<string, number> = {};
                          for (const q of allQuestions) all[q.id] = Number(q.marks) || 1;
                          setSelectedQuestions(all);
                        }}
                      >
                        Select All ({allQuestions.length})
                      </Button>
                      {attachedCount > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedQuestions({})}
                        >
                          Clear
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {allQuestions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="relative flex-1 min-w-52">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Filter bank questions…"
                      value={qSearch}
                      onChange={(e) => setQSearch(e.target.value)}
                      className="h-9 pl-9 text-xs"
                    />
                  </div>
                  <Select
                    aria-label="Filter bank by category"
                    value={qCategoryFilter}
                    onChange={(e) => setQCategoryFilter(e.target.value)}
                    className="h-9 w-44 text-xs"
                  >
                    <option value="">All Categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </CardHeader>

            <CardContent>
              {questionsQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-ink-subtle">
                  <Spinner /> Loading questions…
                </div>
              ) : allQuestions.length === 0 ? (
                <p className="text-sm text-ink-subtle">
                  No questions found in your Question Bank yet. You can create this exam as a Draft and add questions later.
                </p>
              ) : filteredQuestions.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-subtle">
                  No questions match your current filter.
                </p>
              ) : (
                <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
                  {filteredQuestions.map((q) => {
                    const checked = selectedQuestions[q.id] !== undefined;
                    return (
                      <div
                        key={q.id}
                        className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
                          checked
                            ? "border-blue-500 bg-accent-soft/50"
                            : "border-border bg-surface-subtle"
                        }`}
                      >
                        <label className="flex flex-1 cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleQuestion(q.id, q.marks)}
                            className="mt-1 h-4 w-4 accent-blue-600"
                          />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">{q.text}</p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge tone="neutral">{q.type}</Badge>
                              <Badge tone="neutral">Diff {q.difficulty}</Badge>
                              {q.category?.name && (
                                <Badge tone="accent">{q.category.name}</Badge>
                              )}
                            </div>
                          </div>
                        </label>
                        {checked && (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="text-xs text-ink-subtle">Marks:</span>
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
        <Card className="rounded-2xl border-border shadow-2xs">
          <CardHeader>
            <h2 className="text-base font-bold text-foreground">Pre-Publication Review</h2>
            <p className="text-xs text-ink-subtle">
              Saving commits a cryptographic SHA-256 seed so per-student randomization can be audited after completion.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 rounded-xl border border-border bg-surface-subtle p-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Title</p>
                <p className="font-semibold text-foreground">{title}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">
                  Duration &amp; Grace
                </p>
                <p className="text-ink-muted">
                  {durationMin} min (+{graceSec}s offline sync grace)
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Schedule Window</p>
                <p className="text-ink-muted">
                  {new Date(startLocal).toLocaleString()} → {new Date(endLocal).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Question Paper</p>
                <p className="text-ink-muted">
                  {attachedCount} attached ({totalSelectedMarks} pts)
                  {useBlueprint ? ` · Blueprint (${blueprint.length} quota rules)` : ""}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>
                {attachedCount > 0
                  ? "You can save as Draft to enroll candidates first, or Publish immediately so enrolled students can enter inside the scheduled window."
                  : "No questions attached yet — save as Draft and attach questions before publishing."}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <Button variant="secondary" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={saveMut.isPending}
                  onClick={() => handleSave(false)}
                >
                  {saveMut.isPending ? (
                    <Spinner />
                  ) : isEditing ? (
                    "Save Changes"
                  ) : (
                    "Save as Draft"
                  )}
                </Button>
                <Button
                  variant="verified"
                  disabled={saveMut.isPending || attachedCount === 0}
                  onClick={() => handleSave(true)}
                >
                  <Send className="h-4 w-4" />
                  {existingExam?.status === "PUBLISHED" ? "Save & Keep Published" : "Save & Publish"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function CreateExamPanel({
  initialTemplate,
  editExamId,
  onCancelEdit,
  onApplyTemplate,
  onSuccessExam,
}: CreateExamPanelProps) {
  const editQuery = useQuery({
    queryKey: ["exam-edit-load", editExamId],
    queryFn: () => api.exams.get(editExamId!),
    enabled: Boolean(editExamId),
  });

  if (editExamId) {
    if (editQuery.isLoading) {
      return (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-subtle">
          <Spinner className="h-5 w-5 text-accent" /> Loading examination configuration…
        </div>
      );
    }
    if (editQuery.error || !editQuery.data?.exam) {
      return (
        <Card className="mx-auto max-w-3xl">
          <CardContent className="space-y-3 text-sm text-rose-600">
            <p>{(editQuery.error as Error)?.message ?? "Could not load exam"}</p>
            {onCancelEdit && (
              <Button variant="secondary" size="sm" onClick={onCancelEdit}>
                Back
              </Button>
            )}
          </CardContent>
        </Card>
      );
    }

    return (
      <CreateExamFormInner
        key={`edit-${editQuery.data.exam.id}`}
        existingExam={editQuery.data.exam}
        existingQuestions={editQuery.data.questions ?? []}
        onCancelEdit={onCancelEdit}
        onSuccessExam={onSuccessExam}
      />
    );
  }

  return (
    <CreateExamFormInner
      key={`new-${initialTemplate?.id ?? "blank"}`}
      initialTemplate={initialTemplate}
      onApplyTemplate={onApplyTemplate}
      onSuccessExam={onSuccessExam}
    />
  );
}
