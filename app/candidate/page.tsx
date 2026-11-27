"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Calendar,
  CheckCircle2,
  Clock,
  FileDown,
  Play,
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
  EmptyState,
  Spinner,
} from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import {
  attemptVerifyCode,
  computeClientLifecycle,
  examDurationMin,
  examEndAt,
  examResultsPublished,
  examStartAt,
  examTotalMarks,
  type ExamRecord,
} from "@/lib/client/api-types";

function fmt(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, "MMM d, yyyy · HH:mm");
}

export default function CandidateDashboardPage() {
  const router = useRouter();
  const [ackExam, setAckExam] = useState<ExamRecord | null>(null);
  const [ackChecked, setAckChecked] = useState(false);

  const examsQuery = useQuery({
    queryKey: ["candidate-exams"],
    queryFn: () => api.exams.list(),
  });

  const startMut = useMutation({
    mutationFn: (examId: string) =>
      api.attempts.start(examId, { isSandbox: false, integrityAck: true }),
    onSuccess: (res) => {
      setAckExam(null);
      setAckChecked(false);
      router.push(`/exam/${res.attempt.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Support both categorized response { available, upcoming, completed } and flat { exams }
  const available = [...(examsQuery.data?.available ?? [])];
  const upcoming = [...(examsQuery.data?.upcoming ?? [])];
  const completed = [...(examsQuery.data?.completed ?? [])];

  if (
    available.length === 0 &&
    upcoming.length === 0 &&
    completed.length === 0 &&
    examsQuery.data?.exams?.length
  ) {
    for (const ex of examsQuery.data.exams) {
      const lc = computeClientLifecycle(ex);
      const st = ex.attempt?.status;
      if (st === "SUBMITTED" || st === "EXPIRED" || st === "GRADED" || lc === "COMPLETED") {
        completed.push(ex);
      } else if (lc === "ONGOING") {
        available.push(ex);
      } else {
        upcoming.push(ex);
      }
    }
  }

  return (
    <AppShell
      allowedRoles={["CANDIDATE", "ADMIN", "EXAMINER"]}
      title="Candidate Exam Portal"
      subtitle="View your enrolled examinations, resume active sessions without losing answers, and verify published results."
    >
      {examsQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
          <Spinner /> Loading your enrolled examinations…
        </div>
      ) : examsQuery.error ? (
        <Card>
          <CardContent className="text-sm text-danger">
            {(examsQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* AVAILABLE NOW */}
          <section aria-labelledby="heading-available">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="heading-available" className="text-lg font-semibold">
                Available Now ({available.length})
              </h2>
              <Badge tone="verified">Window Open</Badge>
            </div>

            {available.length === 0 ? (
              <EmptyState
                title="No exams open right now"
                description="When an examiner publishes an exam and its scheduled window begins, it will appear here."
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {available.map((exam) => {
                  const inProgress = exam.attempt?.status === "IN_PROGRESS";
                  return (
                    <Card key={exam.id} className="border-accent/30">
                      <CardContent className="space-y-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                            <Badge tone="verified">ONGOING</Badge>
                            {inProgress && <Badge tone="warning">In Progress — Resume</Badge>}
                          </div>
                          <h3 className="text-lg font-semibold">{exam.title}</h3>
                          {exam.instructions && (
                            <p className="mt-1 text-xs text-ink-muted line-clamp-2">
                              {exam.instructions}
                            </p>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface-subtle p-3 text-xs text-ink-muted">
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" /> {examDurationMin(exam)} min
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" /> Closes {fmt(examEndAt(exam))}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-ink-subtle">
                            {examTotalMarks(exam)} total marks
                          </span>
                          {inProgress && exam.attempt ? (
                            <Link href={`/exam/${exam.attempt.id}`}>
                              <Button variant="verified">
                                <Play className="h-4 w-4" /> Resume Attempt
                              </Button>
                            </Link>
                          ) : (
                            <Button
                              onClick={() => {
                                setAckExam(exam);
                                setAckChecked(false);
                              }}
                            >
                              <Play className="h-4 w-4" /> Start Exam
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* UPCOMING */}
          <section aria-labelledby="heading-upcoming">
            <h2 id="heading-upcoming" className="mb-3 text-lg font-semibold">
              Upcoming ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-muted">No upcoming scheduled exams.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {upcoming.map((exam) => (
                  <Card key={exam.id}>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">{exam.title}</h3>
                        <Badge tone="accent">UPCOMING</Badge>
                      </div>
                      <p className="text-xs text-ink-muted">
                        Opens: <strong>{fmt(examStartAt(exam))}</strong> · Duration:{" "}
                        {examDurationMin(exam)} min
                      </p>
                      <p className="text-xs text-ink-subtle">
                        Entry is locked by the server until the scheduled start time.
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* COMPLETED */}
          <section aria-labelledby="heading-completed">
            <h2 id="heading-completed" className="mb-3 text-lg font-semibold">
              Completed ({completed.length})
            </h2>
            {completed.length === 0 ? (
              <p className="text-sm text-ink-muted">No completed exams yet.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {completed.map((exam) => {
                  const att = exam.attempt;
                  const published = examResultsPublished(exam);
                  const code = att ? attemptVerifyCode(att) : "";
                  return (
                    <Card key={exam.id}>
                      <CardContent className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold">{exam.title}</h3>
                            <p className="text-xs text-ink-subtle">
                              Window closed {fmt(examEndAt(exam))}
                            </p>
                          </div>
                          <Badge tone={published ? "verified" : "neutral"}>
                            {att?.status ?? "COMPLETED"}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {att && published ? (
                            <>
                              <Link href={`/results/${att.id}`}>
                                <Button size="sm">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> View Result &amp; Receipts
                                </Button>
                              </Link>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={async () => {
                                  try {
                                    await api.reports.downloadAttemptPdf(att.id, code);
                                    toast.success("Result PDF downloaded");
                                  } catch (e) {
                                    toast.error((e as Error).message);
                                  }
                                }}
                              >
                                <FileDown className="h-3.5 w-3.5" /> PDF
                              </Button>
                            </>
                          ) : att ? (
                            <Badge tone="warning">Awaiting Examiner Result Publication</Badge>
                          ) : (
                            <Badge tone="neutral">Not Attempted</Badge>
                          )}

                          {code && (
                            <Link href={`/verify/${encodeURIComponent(code)}`}>
                              <Button size="sm" variant="ghost">
                                <ShieldCheck className="h-3.5 w-3.5 text-verified" /> Verify
                              </Button>
                            </Link>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Privacy-First Integrity Policy Acknowledgment Modal */}
      {ackExam && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Exam Integrity Policy Acknowledgment"
        >
          <Card className="w-full max-w-lg">
            <CardHeader>
              <h3 className="text-base font-semibold">Before You Start: {ackExam.title}</h3>
              <p className="text-xs text-ink-muted">
                Duration: {examDurationMin(ackExam)} minutes · Server-authoritative timer
              </p>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-2 rounded-lg border border-border bg-surface-subtle p-3.5 text-xs text-ink-muted">
                <p className="flex items-start gap-2">
                  <WifiOff className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <span>
                    <strong>Offline Resilience:</strong> If your internet drops, keep answering. Your responses are stored locally in IndexedDB and synced with cryptographic receipts on reconnect.
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-verified shrink-0 mt-0.5" />
                  <span>
                    <strong>Privacy-First Indicators (Not Proof):</strong> We never use your webcam or screen recording. Fullscreen exits, tab switches, and paste attempts are logged solely as review indicators — never automated failure.
                  </span>
                </p>
              </div>

              {ackExam.instructions && (
                <div className="text-xs text-ink-muted">
                  <p className="font-semibold text-foreground mb-1">Examiner Instructions:</p>
                  <p>{ackExam.instructions}</p>
                </div>
              )}

              <label className="flex items-start gap-2.5 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={ackChecked}
                  onChange={(e) => setAckChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-accent"
                />
                <span>
                  I understand the server deadline policy and acknowledge the privacy-first integrity indicators.
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" onClick={() => setAckExam(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={!ackChecked || startMut.isPending}
                  onClick={() => startMut.mutate(ackExam.id)}
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
