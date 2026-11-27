"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CheckCircle2,
  Clock,
  Eraser,
  Play,
  Send,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Spinner,
} from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { examDurationMin, examTotalMarks } from "@/lib/client/api-types";

export default function TestInstructionsPage() {
  const params = useParams<{ examId: string }>();
  const router = useRouter();
  const examId = params.examId;

  const [ackChecked, setAckChecked] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const examQuery = useQuery({
    queryKey: ["exam-instructions", examId],
    queryFn: () => api.exams.get(examId),
    enabled: Boolean(examId),
  });

  const startMut = useMutation({
    mutationFn: () =>
      api.attempts.start(examId, { isSandbox: false, integrityAck: true }),
    onSuccess: (res) => {
      setConfirmOpen(false);
      router.push(`/exam/${res.attempt.id}`);
    },
    onError: (err: Error) => {
      setConfirmOpen(false);
      toast.error(err.message);
    },
  });

  const exam = examQuery.data?.exam;
  const attempt = exam?.attempt;
  const alreadyCompleted =
    attempt && attempt.status !== "IN_PROGRESS";
  const inProgress = attempt?.status === "IN_PROGRESS";
  const rules = Array.isArray(exam?.rules) ? exam.rules : [];

  return (
    <AppShell
      allowedRoles={["CANDIDATE", "ADMIN", "EXAMINER"]}
      title="Test Instructions & Pre-Exam Briefing"
      subtitle="Read all rules and navigation controls carefully before starting your server-timed examination."
      actions={
        <Link href="/candidate">
          <Button variant="secondary" size="sm">
            <ArrowLeft className="h-4 w-4" /> Back to My Exams
          </Button>
        </Link>
      }
    >
      {examQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
          <Spinner /> Loading examination instructions…
        </div>
      ) : examQuery.error || !exam ? (
        <Card>
          <CardContent className="text-sm text-danger">
            {(examQuery.error as Error)?.message ?? "Unable to load exam instructions."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column: Exam Info & Rules (EMS TestInstruction.js left side) */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge tone="verified">{exam.lifecycle ?? exam.status}</Badge>
                {exam.category && <Badge tone="accent">{exam.category}</Badge>}
                {(exam.class_name ?? exam.className) && (
                  <Badge tone="neutral">
                    Class {exam.class_name ?? exam.className}
                    {exam.section ? ` · Sec ${exam.section}` : ""}
                  </Badge>
                )}
              </div>
              <h2 className="text-xl font-semibold text-foreground">{exam.title}</h2>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface-subtle p-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase text-ink-subtle">Total Questions</p>
                  <p className="mt-0.5 font-mono font-bold text-foreground">
                    {exam.questionCount ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-ink-subtle">Allocated Time</p>
                  <p className="mt-0.5 font-mono font-bold text-foreground flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-accent" />
                    {examDurationMin(exam)} Minutes
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-ink-subtle">Total Marks</p>
                  <p className="mt-0.5 font-mono font-bold text-foreground">
                    {examTotalMarks(exam)} Marks
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-ink-subtle">Attempts Allowed</p>
                  <p className="mt-0.5 font-medium text-foreground">1 (Strict Single Attempt)</p>
                </div>
              </div>

              {exam.instructions && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                    Examiner Notes
                  </h3>
                  <p className="text-sm text-ink-muted leading-relaxed">{exam.instructions}</p>
                </div>
              )}

              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                  Examination Rules
                </h3>
                <ul className="space-y-2">
                  {(rules.length > 0
                    ? rules
                    : [
                        "Only one attempt is permitted per exam; re-attempting is prohibited.",
                        "Your countdown timer is synced with the server and auto-submits when time ends.",
                        "Answers are automatically saved locally and synced with cryptographic receipts.",
                      ]
                  ).map((rule, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-subtle px-3.5 py-2.5 text-xs text-foreground"
                    >
                      <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-accent" />
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Right Column: Navigation Buttons Guide & Integrity/Offline Confirmation */}
          <Card className="flex flex-col justify-between">
            <CardHeader>
              <h2 className="text-base font-semibold">Navigation Controls &amp; Fair Policy</h2>
              <p className="text-xs text-ink-muted">
                Familiarize yourself with the live exam workspace controls before continuing.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-subtle p-2.5">
                  <span className="inline-flex w-28 shrink-0 items-center justify-center gap-1 rounded-md bg-accent px-2.5 py-1.5 font-semibold text-accent-ink">
                    Next <ArrowRight className="h-3 w-3" />
                  </span>
                  <span className="text-ink-muted">
                    Move forward to the next question in your frozen paper.
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-subtle p-2.5">
                  <span className="inline-flex w-28 shrink-0 items-center justify-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 font-semibold text-foreground">
                    <ArrowLeft className="h-3 w-3" /> Previous
                  </span>
                  <span className="text-ink-muted">
                    Return to the previous question (unless No-Backtrack is enabled).
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-subtle p-2.5">
                  <span className="inline-flex w-28 shrink-0 items-center justify-center gap-1 rounded-md bg-warning-soft border border-warning/40 px-2.5 py-1.5 font-semibold text-warning">
                    <Bookmark className="h-3 w-3" /> Flag
                  </span>
                  <span className="text-ink-muted">
                    Mark a question for review in the Question Palette so you can revisit it before submitting.
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-subtle p-2.5">
                  <span className="inline-flex w-28 shrink-0 items-center justify-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 font-semibold text-ink-muted">
                    <Eraser className="h-3 w-3" /> Clear
                  </span>
                  <span className="text-ink-muted">
                    Clear your currently selected option or written response for the active question.
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-subtle p-2.5">
                  <span className="inline-flex w-28 shrink-0 items-center justify-center gap-1 rounded-md bg-verified px-2.5 py-1.5 font-semibold text-white">
                    <Send className="h-3 w-3" /> End Test
                  </span>
                  <span className="text-ink-muted">
                    Review your answered/unanswered counts and seal your final submission.
                  </span>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-border bg-surface-subtle p-3.5 text-xs text-ink-muted">
                <p className="flex items-start gap-2">
                  <WifiOff className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <span>
                    <strong>Offline Resilience:</strong> If your connection drops, keep answering. Responses are saved locally in IndexedDB and synced with signed receipts upon reconnect.
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-verified shrink-0 mt-0.5" />
                  <span>
                    <strong>Privacy-First Indicators (Not Proof):</strong> No webcam or screen recording is used. Tab switches and fullscreen exits are logged strictly as review indicators.
                  </span>
                </p>
              </div>

              {alreadyCompleted ? (
                <div className="rounded-xl border border-verified/30 bg-verified-soft p-4 text-center space-y-2">
                  <CheckCircle2 className="mx-auto h-6 w-6 text-verified" />
                  <p className="text-sm font-semibold text-verified">
                    You have already attempted this exam ({attempt.status}).
                  </p>
                  <div className="flex justify-center gap-2 pt-1">
                    <Link href={`/results/${attempt.id}`}>
                      <Button size="sm">View Result</Button>
                    </Link>
                    <Link href="/candidate">
                      <Button size="sm" variant="secondary">
                        Back to Portal
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : inProgress && attempt ? (
                <div className="flex justify-end">
                  <Link href={`/exam/${attempt.id}`} className="w-full sm:w-auto">
                    <Button variant="verified" size="lg" className="w-full">
                      <Play className="h-4 w-4" /> Resume Active Attempt
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3 border-t border-border pt-4">
                  <label className="flex items-start gap-2.5 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ackChecked}
                      onChange={(e) => setAckChecked(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-accent"
                    />
                    <span>
                      I have read the test rules, understand the server-authoritative deadline, and acknowledge the privacy-first integrity indicators.
                    </span>
                  </label>

                  <Button
                    size="lg"
                    className="w-full"
                    disabled={!ackChecked || exam.lifecycle !== "ONGOING"}
                    onClick={() => setConfirmOpen(true)}
                  >
                    <Play className="h-4 w-4" />
                    {exam.lifecycle === "ONGOING"
                      ? "Continue to Start Exam"
                      : `Exam Window is ${exam.lifecycle ?? exam.status}`}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Final Confirmation Dialog (EMS "Once you click OK, timer will start!") */}
      {confirmOpen && exam && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Start Exam Confirmation"
        >
          <Card className="w-full max-w-md">
            <CardHeader>
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <AlertTriangle className="h-4.5 w-4.5 text-warning" />
                Start {exam.title} now?
              </h3>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-ink-muted">
              <p>
                Once you click <strong>Begin Exam</strong>, your{" "}
                <strong>{examDurationMin(exam)}-minute</strong> server-authoritative countdown timer
                will start immediately and your personalized question paper will be frozen.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="verified"
                  disabled={startMut.isPending}
                  onClick={() => startMut.mutate()}
                >
                  {startMut.isPending ? (
                    <>
                      <Spinner /> Starting…
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" /> Begin Exam
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
