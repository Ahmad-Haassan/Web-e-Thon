"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import { GraduationCap, MailPlus, Upload, Users } from "lucide-react";
import { toast } from "sonner";
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
import type { BulkImportResponse } from "@/lib/client/api-types";

export function EnrollmentsTab({ examId }: { examId: string }) {
  const qc = useQueryClient();
  const [emailsInput, setEmailsInput] = useState("");
  const [classInput, setClassInput] = useState("");
  const [sectionInput, setSectionInput] = useState("");
  const [csvText, setCsvText] = useState("");
  const [csvRowCount, setCsvRowCount] = useState<number | null>(null);
  const [importRes, setImportRes] = useState<BulkImportResponse | null>(null);

  const enrollmentsQuery = useQuery({
    queryKey: ["exam-enrollments", examId],
    queryFn: () => api.exams.listEnrollments(examId),
  });

  const classesQuery = useQuery({
    queryKey: ["registered-classes"],
    queryFn: () => api.classes.list(),
  });

  const enrollMut = useMutation({
    mutationFn: (emails: string[]) => api.exams.enroll(examId, emails),
    onSuccess: (res) => {
      toast.success(
        `Enrolled ${res.enrolled} candidate(s)${
          res.notFound?.length ? ` · ${res.notFound.length} email(s) not registered` : ""
        }`
      );
      if (res.notFound?.length) {
        toast.warning(`Not found: ${res.notFound.join(", ")}`);
      }
      setEmailsInput("");
      qc.invalidateQueries({ queryKey: ["exam-enrollments", examId] });
      qc.invalidateQueries({ queryKey: ["exam-detail", examId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const enrollClassMut = useMutation({
    mutationFn: ({ className, section }: { className: string; section?: string }) =>
      api.exams.enrollByClass(examId, className, section),
    onSuccess: (res, vars) => {
      toast.success(
        `Enrolled ${res.enrolled} student(s) from Class ${vars.className}${
          vars.section ? ` Section ${vars.section}` : ""
        }`
      );
      qc.invalidateQueries({ queryKey: ["exam-enrollments", examId] });
      qc.invalidateQueries({ queryKey: ["exam-detail", examId] });
      qc.invalidateQueries({ queryKey: ["registered-classes"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkImportMut = useMutation({
    mutationFn: (csv: string) => api.imports.candidates({ csv, examId }),
    onSuccess: (res) => {
      setImportRes(res);
      toast.success(
        `Created ${res.created}, enrolled ${res.enrolled ?? 0}${
          res.failed ? `, ${res.failed} failed` : ""
        }`
      );
      qc.invalidateQueries({ queryKey: ["exam-enrollments", examId] });
      qc.invalidateQueries({ queryKey: ["exam-detail", examId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleManualEnroll(e: FormEvent) {
    e.preventDefault();
    const emails = emailsInput
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      toast.error("Enter at least one candidate email");
      return;
    }
    enrollMut.mutate(emails);
  }

  function handleClassEnroll(e: FormEvent) {
    e.preventDefault();
    if (!classInput.trim()) {
      toast.error("Enter or select a Class to enroll");
      return;
    }
    enrollClassMut.mutate({
      className: classInput.trim(),
      section: sectionInput.trim() || undefined,
    });
  }

  function handleCsvUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "");
      setCsvText(content);
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
      setCsvRowCount(parsed.data.length);
      setImportRes(null);
    };
    reader.readAsText(file);
  }

  const enrollments = enrollmentsQuery.data?.enrollments ?? [];
  const classes = classesQuery.data?.classes ?? [];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        {/* Assign / Enroll by Class & Section (EMS workflow) */}
        <Card>
          <CardHeader>
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <GraduationCap className="h-4.5 w-4.5 text-accent" />
              Assign Entire Class / Section
            </h3>
            <p className="text-xs text-ink-muted">
              Quickly enroll every active candidate registered in a Class (and optional Section).
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {classes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {classes.map((c) => (
                  <button
                    key={c.className}
                    type="button"
                    onClick={() => {
                      setClassInput(c.className);
                      setSectionInput("");
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      classInput === c.className
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border bg-surface-subtle text-ink-muted hover:border-border-strong"
                    }`}
                  >
                    {c.className} ({c.totalStudents})
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleClassEnroll} className="grid gap-3 sm:grid-cols-3 items-end">
              <div>
                <Label htmlFor="enroll-class">Class</Label>
                <Input
                  id="enroll-class"
                  placeholder="e.g. IX or BSCS-4"
                  value={classInput}
                  onChange={(e) => setClassInput(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="enroll-section">Section (optional)</Label>
                <Select
                  id="enroll-section"
                  value={sectionInput}
                  onChange={(e) => setSectionInput(e.target.value)}
                >
                  <option value="">All Sections</option>
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                  <option value="D">Section D</option>
                </Select>
              </div>
              <Button type="submit" disabled={enrollClassMut.isPending}>
                {enrollClassMut.isPending ? <Spinner /> : "Enroll Class"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold">Enroll Existing Candidates by Email</h3>
            <p className="text-xs text-ink-muted">
              Separate multiple university emails with commas or newlines.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleManualEnroll} className="space-y-3">
              <div>
                <Label htmlFor="enroll-emails">Candidate Emails</Label>
                <Textarea
                  id="enroll-emails"
                  rows={3}
                  placeholder="student1@university.edu&#10;student2@university.edu"
                  value={emailsInput}
                  onChange={(e) => setEmailsInput(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={enrollMut.isPending}>
                {enrollMut.isPending ? (
                  <Spinner />
                ) : (
                  <>
                    <MailPlus className="h-4 w-4" /> Enroll Candidates
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold">Bulk CSV Candidate Import &amp; Auto-Enroll</h3>
            <p className="text-xs text-ink-muted">
              Columns: <code className="font-mono">name,email,password</code>. Creates missing candidate accounts and enrolls them in this exam.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCsvUpload(f);
                }}
                className="text-xs text-ink-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface-muted file:px-3 file:py-1.5 file:text-xs file:font-medium"
              />
              {csvRowCount !== null && <Badge tone="accent">{csvRowCount} rows</Badge>}
            </div>

            <Textarea
              rows={3}
              placeholder="name,email,password&#10;Ali Raza,ali@university.edu,TempPass123!"
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                const parsed = Papa.parse(e.target.value, { header: true, skipEmptyLines: true });
                setCsvRowCount(parsed.data.length);
              }}
            />

            <Button
              variant="secondary"
              disabled={!csvText.trim() || bulkImportMut.isPending}
              onClick={() => bulkImportMut.mutate(csvText)}
            >
              {bulkImportMut.isPending ? (
                <Spinner />
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Import &amp; Enroll CSV
                </>
              )}
            </Button>

            {importRes && (
              <div className="rounded-lg border border-border bg-surface-subtle p-3 text-xs space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="verified">Created: {importRes.created}</Badge>
                  <Badge tone="accent">Enrolled: {importRes.enrolled ?? 0}</Badge>
                  <Badge tone={importRes.failed > 0 ? "danger" : "neutral"}>
                    Failed: {importRes.failed}
                  </Badge>
                </div>
                {importRes.errors.length > 0 && (
                  <div className="max-h-36 overflow-y-auto rounded border border-danger/30 bg-danger-soft/50 p-2">
                    {importRes.errors.map((err, i) => (
                      <p key={i} className="text-danger">
                        Row {err.row}: {err.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">Enrolled Candidates ({enrollments.length})</h3>
              <p className="text-xs text-ink-muted">
                Only enrolled candidates can view and start this exam inside the scheduled window.
              </p>
            </div>
            <Users className="h-5 w-5 text-ink-subtle" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {enrollmentsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-muted">
              <Spinner /> Loading enrollments…
            </div>
          ) : enrollments.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No candidates enrolled"
                description="Assign a Class/Section, add student emails, or upload a CSV roster on the left."
              />
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[680px] overflow-y-auto">
              {enrollments.map((enr, idx) => {
                const person = enr.candidate ?? enr.user ?? enr.users;
                const displayName = person?.name ?? enr.name ?? "Candidate";
                const displayEmail = person?.email ?? enr.email ?? enr.candidate_id ?? "";
                const cls = person?.class_name;
                const sec = person?.section;
                return (
                  <div
                    key={enr.candidate_id ?? displayEmail ?? idx}
                    className="flex items-center justify-between gap-2 px-5 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground truncate">{displayName}</p>
                        {cls && (
                          <Badge tone="neutral">
                            {cls}
                            {sec ? `-${sec}` : ""}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-ink-subtle truncate">{displayEmail}</p>
                    </div>
                    <Badge tone={enr.status === "REVOKED" ? "danger" : "verified"}>
                      {enr.status ?? "ENROLLED"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
