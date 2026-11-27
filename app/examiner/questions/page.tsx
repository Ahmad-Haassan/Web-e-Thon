"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import {
  CheckCircle2,
  FolderPlus,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Input,
  Label,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import type { BulkImportResponse, QuestionRecord, QuestionType } from "@/lib/client/api-types";
import { createQuestionSchema } from "@/lib/shared/schemas";

interface OptionDraft {
  text: string;
  isCorrect: boolean;
}

const DIFFICULTY_LABEL: Record<1 | 2 | 3, string> = {
  1: "Easy",
  2: "Medium",
  3: "Hard",
};

export default function QuestionBankPage() {
  const qc = useQueryClient();

  // Filters
  const [categoryId, setCategoryId] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");

  // Panels
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  // Create question state
  const [qCategoryId, setQCategoryId] = useState("");
  const [qType, setQType] = useState<QuestionType>("SINGLE");
  const [qDifficulty, setQDifficulty] = useState<1 | 2 | 3>(2);
  const [qText, setQText] = useState("");
  const [qMarks, setQMarks] = useState("2");
  const [qNegative, setQNegative] = useState("0");
  const [qExplanation, setQExplanation] = useState("");
  const [qRubric, setQRubric] = useState("");
  const [options, setOptions] = useState<OptionDraft[]>([
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
  ]);

  // CSV Import state
  const [csvText, setCsvText] = useState("");
  const [csvPreviewCount, setCsvPreviewCount] = useState<number | null>(null);
  const [importResult, setImportResult] = useState<BulkImportResponse | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.categories.list(),
  });

  const questionsQuery = useQuery({
    queryKey: ["questions", categoryId, difficulty, typeFilter, search],
    queryFn: () =>
      api.questions.list({
        categoryId: categoryId || undefined,
        difficulty: difficulty || undefined,
        type: typeFilter || undefined,
        search: search.trim() || undefined,
      }),
  });

  const createCategoryMut = useMutation({
    mutationFn: (name: string) => api.categories.create(name),
    onSuccess: (res) => {
      toast.success(`Category "${res.category.name}" added`);
      setNewCategoryName("");
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createQuestionMut = useMutation({
    mutationFn: api.questions.create,
    onSuccess: () => {
      toast.success("Question saved to bank");
      qc.invalidateQueries({ queryKey: ["questions"] });
      setQText("");
      setQExplanation("");
      setQRubric("");
      setOptions([
        { text: "", isCorrect: true },
        { text: "", isCorrect: false },
        { text: "", isCorrect: false },
        { text: "", isCorrect: false },
      ]);
      setShowCreate(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteQuestionMut = useMutation({
    mutationFn: (id: string) => api.questions.delete(id),
    onSuccess: () => {
      toast.success("Question removed");
      qc.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const importQuestionsMut = useMutation({
    mutationFn: (csv: string) => api.imports.questions({ csv }),
    onSuccess: (res) => {
      setImportResult(res);
      toast.success(`Imported ${res.created} question(s)${res.failed ? `, ${res.failed} failed` : ""}`);
      qc.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleOptionCorrectToggle(idx: number) {
    setOptions((prev) =>
      prev.map((opt, i) => {
        if (qType === "SINGLE") {
          return { ...opt, isCorrect: i === idx };
        }
        return i === idx ? { ...opt, isCorrect: !opt.isCorrect } : opt;
      })
    );
  }

  function handleCreateQuestion(e: FormEvent) {
    e.preventDefault();
    const cleanedOptions =
      qType === "WRITTEN"
        ? []
        : options.filter((o) => o.text.trim().length > 0).map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect }));

    const payload = {
      categoryId: qCategoryId || null,
      type: qType,
      difficulty: qDifficulty,
      text: qText.trim(),
      marks: Number(qMarks),
      negativeMarking: Number(qNegative || 0),
      explanation: qExplanation.trim() || null,
      writtenRubric: qType === "WRITTEN" ? qRubric.trim() || null : null,
      options: cleanedOptions,
    };

    const parsed = createQuestionSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check question fields and correct options");
      return;
    }

    createQuestionMut.mutate(parsed.data);
  }

  function handleCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "");
      setCsvText(content);
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
      setCsvPreviewCount(parsed.data.length);
      setImportResult(null);
    };
    reader.readAsText(file);
  }

  const categories = categoriesQuery.data?.categories ?? [];
  const questions = questionsQuery.data?.questions ?? [];

  function resolveCorrectIds(q: QuestionRecord): Set<string> {
    const ids = new Set<string>(q.correctOptionIds ?? q.correct_option_ids ?? []);
    if (q.question_keys) {
      const keyObj = Array.isArray(q.question_keys) ? q.question_keys[0] : q.question_keys;
      for (const id of keyObj?.correct_option_ids ?? []) ids.add(id);
    }
    for (const o of q.options ?? []) {
      if (o.isCorrect || o.is_correct) ids.add(o.id);
    }
    return ids;
  }

  return (
    <AppShell
      allowedRoles={["ADMIN", "EXAMINER"]}
      title="Question Bank"
      subtitle="Author single-choice, multi-select, and written questions organized by category and difficulty for fair blueprint randomization."
      actions={
        <>
          <Button variant="secondary" onClick={() => setShowImport((v) => !v)}>
            <Upload className="h-4 w-4" />
            Bulk CSV Import
          </Button>
          <Button onClick={() => setShowCreate((v) => !v)}>
            <Plus className="h-4 w-4" />
            {showCreate ? "Close Editor" : "New Question"}
          </Button>
        </>
      }
    >
      {/* Quick Category Creator */}
      <Card className="mb-5">
        <CardContent className="flex flex-wrap items-center gap-3 py-3.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Categories ({categories.length}):
          </span>
          <div className="flex flex-wrap gap-1.5 flex-1">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId((prev) => (prev === c.id ? "" : c.id))}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  categoryId === c.id
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-surface-subtle text-ink-muted hover:text-foreground"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newCategoryName.trim().length < 2) return;
              createCategoryMut.mutate(newCategoryName.trim());
            }}
          >
            <Input
              placeholder="New category…"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="h-8 w-44 text-xs"
            />
            <Button size="sm" variant="secondary" type="submit" disabled={createCategoryMut.isPending}>
              <FolderPlus className="h-3.5 w-3.5" /> Add
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Bulk CSV Import Panel */}
      {showImport && (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-base font-semibold">Bulk CSV Question Import</h2>
            <p className="text-xs text-ink-muted">
              Upload or paste CSV with columns: <code className="font-mono">type,difficulty,text,marks,category,optionA,optionB,optionC,optionD,correct,explanation</code>
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCsvFile(f);
                }}
                className="text-xs text-ink-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface-muted file:px-3 file:py-1.5 file:text-xs file:font-medium"
              />
              {csvPreviewCount !== null && (
                <Badge tone="accent">{csvPreviewCount} rows detected</Badge>
              )}
            </div>

            <Textarea
              rows={5}
              placeholder="type,difficulty,text,marks,optionA,optionB,optionC,optionD,correct&#10;SINGLE,1,What is the time complexity of binary search?,2,O(n),O(log n),O(n log n),O(1),B"
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                const parsed = Papa.parse(e.target.value, { header: true, skipEmptyLines: true });
                setCsvPreviewCount(parsed.data.length);
              }}
            />

            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowImport(false)}>
                Close
              </Button>
              <Button
                disabled={!csvText.trim() || importQuestionsMut.isPending}
                onClick={() => importQuestionsMut.mutate(csvText)}
              >
                {importQuestionsMut.isPending ? <Spinner /> : "Validate & Import CSV"}
              </Button>
            </div>

            {importResult && (
              <div className="rounded-lg border border-border bg-surface-subtle p-4 text-sm space-y-2">
                <div className="flex items-center gap-2">
                  <Badge tone="verified">Created: {importResult.created}</Badge>
                  <Badge tone={importResult.failed > 0 ? "danger" : "neutral"}>
                    Failed: {importResult.failed}
                  </Badge>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded border border-danger/30 bg-danger-soft/50 p-2 text-xs">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-danger">
                          <th className="py-1 pr-3">Row</th>
                          <th className="py-1">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.errors.map((err, i) => (
                          <tr key={i} className="border-t border-danger/20">
                            <td className="py-1 pr-3 font-mono">{err.row}</td>
                            <td className="py-1">{err.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* New Question Editor */}
      {showCreate && (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-base font-semibold">Author New Question</h2>
            <p className="text-xs text-ink-muted">
              Answer keys are stored server-side in <code className="font-mono">question_keys</code> and never sent to candidates during an active attempt.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateQuestion} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <Label htmlFor="q-type">Type</Label>
                  <Select
                    id="q-type"
                    value={qType}
                    onChange={(e) => {
                      const next = e.target.value as QuestionType;
                      setQType(next);
                      if (next === "SINGLE") {
                        setOptions((prev) =>
                          prev.map((o, i) => ({ ...o, isCorrect: i === 0 }))
                        );
                      }
                    }}
                  >
                    <option value="SINGLE">Single Choice (MCQ)</option>
                    <option value="MULTI">Multi-Select (Partial Credit)</option>
                    <option value="WRITTEN">Written / Free Response</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="q-cat">Category</Label>
                  <Select
                    id="q-cat"
                    value={qCategoryId}
                    onChange={(e) => setQCategoryId(e.target.value)}
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="q-diff">Difficulty</Label>
                  <Select
                    id="q-diff"
                    value={qDifficulty}
                    onChange={(e) => setQDifficulty(Number(e.target.value) as 1 | 2 | 3)}
                  >
                    <option value={1}>1 — Easy</option>
                    <option value={2}>2 — Medium</option>
                    <option value={3}>3 — Hard</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="q-marks">Marks</Label>
                  <Input
                    id="q-marks"
                    type="number"
                    min="0.5"
                    step="0.5"
                    required
                    value={qMarks}
                    onChange={(e) => setQMarks(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="q-neg">Negative Marks</Label>
                  <Input
                    id="q-neg"
                    type="number"
                    min="0"
                    step="0.25"
                    value={qNegative}
                    onChange={(e) => setQNegative(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="q-text">Question Prompt</Label>
                <Textarea
                  id="q-text"
                  required
                  rows={3}
                  placeholder="Write a clear, unambiguous academic question…"
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                />
              </div>

              {qType !== "WRITTEN" ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="mb-0">
                      Options ({qType === "SINGLE" ? "select exactly 1 correct" : "select 1 or more correct"})
                    </Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setOptions((prev) => [...prev, { text: "", isCorrect: false }])
                      }
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Option
                    </Button>
                  </div>
                  {options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2.5">
                      <input
                        type={qType === "SINGLE" ? "radio" : "checkbox"}
                        name="correct-option"
                        aria-label={`Mark option ${idx + 1} as correct`}
                        checked={opt.isCorrect}
                        onChange={() => handleOptionCorrectToggle(idx)}
                        className="h-4 w-4 accent-verified cursor-pointer"
                      />
                      <Input
                        placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                        value={opt.text}
                        onChange={(e) =>
                          setOptions((prev) =>
                            prev.map((o, i) => (i === idx ? { ...o, text: e.target.value } : o))
                          )
                        }
                      />
                      {options.length > 2 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setOptions((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5 text-ink-subtle" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <Label htmlFor="q-rubric">Written Grading Rubric (Examiner Only)</Label>
                  <Textarea
                    id="q-rubric"
                    rows={2}
                    placeholder="Key points required for full credit…"
                    value={qRubric}
                    onChange={(e) => setQRubric(e.target.value)}
                  />
                </div>
              )}

              <div>
                <Label htmlFor="q-exp">Explanation (Shown after results are published)</Label>
                <Textarea
                  id="q-exp"
                  rows={2}
                  placeholder="Optional rationale for post-exam review and dispute transparency…"
                  value={qExplanation}
                  onChange={(e) => setQExplanation(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createQuestionMut.isPending}>
                  {createQuestionMut.isPending ? <Spinner /> : "Save Question"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filter Bar & Question List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-subtle" />
              <Input
                placeholder="Search question text…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label="Filter by difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-36"
              >
                <option value="">All Difficulty</option>
                <option value="1">Easy (1)</option>
                <option value="2">Medium (2)</option>
                <option value="3">Hard (3)</option>
              </Select>
              <Select
                aria-label="Filter by type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-36"
              >
                <option value="">All Types</option>
                <option value="SINGLE">Single MCQ</option>
                <option value="MULTI">Multi-Select</option>
                <option value="WRITTEN">Written</option>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {questionsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-muted">
              <Spinner /> Loading question bank…
            </div>
          ) : questionsQuery.error ? (
            <p className="text-sm text-danger">{(questionsQuery.error as Error).message}</p>
          ) : questions.length === 0 ? (
            <EmptyState
              title="No questions in bank yet"
              description="Author your first question or import a CSV batch to build randomized exams."
              action={
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4" /> Create First Question
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {questions.map((q) => {
                const correctIds = resolveCorrectIds(q);
                const catName =
                  q.category?.name ??
                  categories.find((c) => c.id === (q.category_id ?? q.categoryId))?.name;
                return (
                  <div
                    key={q.id}
                    className="rounded-lg border border-border bg-surface-subtle p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="accent">{q.type}</Badge>
                          <Badge
                            tone={
                              q.difficulty === 1
                                ? "verified"
                                : q.difficulty === 2
                                ? "warning"
                                : "danger"
                            }
                          >
                            {DIFFICULTY_LABEL[q.difficulty]}
                          </Badge>
                          <Badge tone="neutral">{q.marks} pts</Badge>
                          {catName && <Badge tone="neutral">{catName}</Badge>}
                        </div>
                        <p className="text-sm font-medium text-foreground">{q.text}</p>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Delete question"
                        onClick={() => deleteQuestionMut.mutate(q.id)}
                      >
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </div>

                    {q.options && q.options.length > 0 && (
                      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                        {q.options.map((o) => {
                          const isCorr = correctIds.has(o.id);
                          return (
                            <div
                              key={o.id}
                              className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                                isCorr
                                  ? "border-verified/40 bg-verified-soft text-verified font-medium"
                                  : "border-border bg-surface text-ink-muted"
                              }`}
                            >
                              {isCorr && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                              <span>{o.text}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
