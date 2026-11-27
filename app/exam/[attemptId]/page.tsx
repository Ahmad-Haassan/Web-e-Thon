"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  CloudOff,
  FileText,
  FlaskConical,
  KeyRound,
  LayoutPanelLeft,
  Maximize2,
  Megaphone,
  Minimize2,
  NotebookPen,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { WorkspacePrefsMenu } from "@/components/app-shell";
import { ReceiptsDrawer } from "@/components/exam/receipts-drawer";
import { ScratchpadDrawer } from "@/components/exam/scratchpad-drawer";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  Label,
  Spinner,
  Textarea,
} from "@/components/ui/primitives";
import { useAuth } from "@/hooks/use-auth";
import { useNetworkHeartbeat } from "@/hooks/use-network-heartbeat";
import { useServerClock } from "@/hooks/use-server-clock";
import { api, ApiError } from "@/lib/client/api";
import {
  attemptDeadlineAt,
  attemptMaxScore,
  attemptVerifyCode,
  type AnnouncementRecord,
  type AttemptSummary,
  type ClientSnapshotQuestion,
  type SignedReceipt,
} from "@/lib/client/api-types";
import { refreshAccessToken } from "@/lib/client/supabase";
import {
  clearSyncedEvents,
  consumeOfflineDurationSec,
  enqueueAnswer,
  enqueueOfflineEvent,
  hydrateAttemptCache,
  loadAttemptCache,
  markAnswersSynced,
  recordOfflineStart,
  type LocalAnswerState,
} from "@/lib/offline/queue";

type SyncStatus = "saved" | "saving" | "offline" | "error";

export default function ExamWorkspacePage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = params.attemptId;
  const { prefs, updatePrefs } = useAuth();

  // Core attempt state
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<AttemptSummary | null>(null);
  const [examTitle, setExamTitle] = useState("Examination Workspace");
  const [examId, setExamId] = useState<string | null>(null);
  const [noBacktrack, setNoBacktrack] = useState(false);
  const [questions, setQuestions] = useState<ClientSnapshotQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, LocalAnswerState>>({});
  const [receipts, setReceipts] = useState<SignedReceipt[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("saved");
  const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);
  const [deadlineIso, setDeadlineIso] = useState<string | null>(null);

  // Navigation & UI drawers
  const [currentIdx, setCurrentIdx] = useState(0);
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const [receiptsOpen, setReceiptsOpen] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitReceipt, setSubmitReceipt] = useState<{
    score: number | null;
    maxScore: number;
    pendingManualCount: number;
    checkpointHash?: string | null;
    verifyCode: string;
  } | null>(null);

  // Soft-lock & indicators
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [escalation, setEscalation] = useState<"OK" | "WARN" | "FLAGGED" | "ALERT_EXAMINER">("OK");
  const [indicatorCounts, setIndicatorCounts] = useState({ blurs: 0, fsExits: 0, pastes: 0 });
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockCode, setUnlockCode] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  // Live announcements
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [dismissedAnnId, setDismissedAnnId] = useState<string | null>(null);

  const flushingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionStartRef = useRef<number>(0);
  const sessionTokenRef = useRef<string | undefined>(undefined);
  const syncServerNowRef = useRef<(serverNow: number | string) => void>(() => {});

  useEffect(() => {
    sessionTokenRef.current = sessionToken;
  }, [sessionToken]);

  const isActiveAttempt =
    attempt !== null && attempt.status === "IN_PROGRESS" && submitReceipt === null;

  // --- Flush IndexedDB Queue to Server (Refresh Token First on Reconnect) ---
  const flushQueue = useCallback(
    async (opts?: { forceTokenRefresh?: boolean; showToast?: boolean }) => {
      if (flushingRef.current) return;
      flushingRef.current = true;

      try {
        const cache = await loadAttemptCache(attemptId);
        if (cache.pendingAnswers.length === 0 && cache.pendingEvents.length === 0) {
          setPendingCount(0);
          setSyncStatus("saved");
          return;
        }

        setSyncStatus("saving");

        if (opts?.forceTokenRefresh) {
          await refreshAccessToken();
        }

        // 1. Flush queued events (DISCONNECT / RECONNECT / TAB_BLUR / etc.)
        if (cache.pendingEvents.length > 0) {
          let sent = 0;
          for (const ev of cache.pendingEvents) {
            try {
              await api.attempts.logEvent(attemptId, ev);
              sent++;
            } catch {
              break;
            }
          }
          if (sent > 0) {
            await clearSyncedEvents(attemptId, sent);
          }
        }

        // 2. Flush queued answers in strict clientSeq order (batched up to 100 per request)
        let totalSynced = 0;
        let totalReceipts = 0;
        let rejectedReason: string | null = null;
        let rejectedCount = 0;

        while (true) {
          const freshCache = await loadAttemptCache(attemptId);
          if (freshCache.pendingAnswers.length === 0) {
            setPendingCount(0);
            setSyncStatus("saved");
            break;
          }

          const batch = freshCache.pendingAnswers.slice(0, 100);
          const res = await api.attempts.syncAnswers(attemptId, {
            answers: batch,
            sessionToken: sessionTokenRef.current ?? freshCache.sessionToken,
          });

          const updated = await markAnswersSynced(
            attemptId,
            batch.map((b) => b.clientSeq),
            res.receipts ?? []
          );

          totalSynced += batch.length;
          totalReceipts += res.receipts?.length ?? batch.length;

          setReceipts(updated.receipts);
          setPendingCount(updated.pendingAnswers.length);

          if (res.serverNow) {
            syncServerNowRef.current(res.serverNow);
          }

          const rejected = (res.receipts ?? []).filter((r) => r.accepted === false);
          if (rejected.length > 0) {
            rejectedCount += rejected.length;
            rejectedReason = rejected[0].rejectReason || "past deadline";
          }

          if (updated.pendingAnswers.length === 0) {
            setSyncStatus("saved");
            break;
          }
        }

        if (rejectedCount > 0) {
          toast.warning(
            `${rejectedCount} answer(s) rejected by server (${rejectedReason})`
          );
        } else if (opts?.showToast && totalSynced > 0) {
          toast.success(
            `Synced ${totalSynced} queued answer(s) · ${totalReceipts} signed receipt(s) received`
          );
        }
      } catch (err) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 401) {
          setSyncStatus("error");
          toast.error(err.message);
        } else {
          setSyncStatus("offline");
        }
      } finally {
        flushingRef.current = false;
      }
    },
    [attemptId]
  );

  // --- Server-Authoritative Clock ---
  const handleAutoSubmitOnExpire = useCallback(async () => {
    if (!isActiveAttempt || submitting) return;
    toast.warning("Server deadline reached — submitting your attempt automatically");
    await flushQueue({ forceTokenRefresh: true });
    try {
      const res = await api.attempts.submit(attemptId);
      setAttempt(res.attempt);
      setSubmitReceipt({
        score: res.score,
        maxScore: res.maxScore,
        pendingManualCount: res.pendingManualCount,
        checkpointHash: res.checkpointHash,
        verifyCode: attemptVerifyCode(res.attempt),
      });
    } catch {
      // Server expiry finalizer will also finalize lazily
    }
  }, [attemptId, flushQueue, isActiveAttempt, submitting]);

  const clock = useServerClock(deadlineIso, {
    enabled: isActiveAttempt,
    onExpired: handleAutoSubmitOnExpire,
  });

  useEffect(() => {
    syncServerNowRef.current = clock.syncFromServerNow;
  }, [clock.syncFromServerNow]);

  // --- Network Heartbeat (Offline Resilience & Reconnect Sync) ---
  const network = useNetworkHeartbeat({
    enabled: isActiveAttempt,
    onDisconnect: async () => {
      setSyncStatus("offline");
      await recordOfflineStart(attemptId);
      await enqueueOfflineEvent(attemptId, {
        type: "DISCONNECT",
        meta: { navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : false },
        at: new Date().toISOString(),
      });
      toast.warning(
        "Connection lost — keep answering! Responses are safely queued in IndexedDB."
      );
    },
    onReconnect: async (serverNow) => {
      if (serverNow) clock.syncFromServerNow(serverNow);
      const offlineSec = await consumeOfflineDurationSec(attemptId);
      await enqueueOfflineEvent(attemptId, {
        type: "RECONNECT",
        meta: { offlineDurationSec: offlineSec ?? 0 },
        at: new Date().toISOString(),
      });
      await clock.syncWithApi();
      await flushQueue({ forceTokenRefresh: true, showToast: true });
    },
  });

  // --- Initial Hydration (Server + IndexedDB fallback for offline refresh!) ---
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const localCache = await loadAttemptCache(attemptId);

      try {
        const res = await api.attempts.get(attemptId);
        if (!active) return;

        const merged = await hydrateAttemptCache(attemptId, res);
        setAttempt(res.attempt);
        setQuestions(res.questions ?? []);
        setAnswers(merged.latestAnswers);
        setReceipts(merged.receipts);
        setPendingCount(merged.pendingAnswers.length);
        setDeadlineIso(attemptDeadlineAt(res.attempt));
        setSessionToken(res.sessionToken ?? merged.sessionToken);
        setExamId(res.attempt.exam_id ?? res.attempt.examId ?? res.exam?.id ?? null);
        if (res.exam?.title) setExamTitle(res.exam.title);
        if (res.exam?.no_backtrack ?? res.exam?.noBacktrack) setNoBacktrack(true);
        if (res.serverNow) clock.syncFromServerNow(res.serverNow);

        setLoading(false);

        if (res.attempt.status === "IN_PROGRESS" && merged.pendingAnswers.length > 0) {
          flushQueue({ forceTokenRefresh: true, showToast: true });
        }
      } catch (err) {
        if (!active) return;
        // Offline refresh recovery from IndexedDB snapshot!
        if (localCache.snapshot) {
          setAttempt(localCache.snapshot.attempt);
          setQuestions(localCache.snapshot.questions);
          setAnswers(localCache.latestAnswers);
          setReceipts(localCache.receipts);
          setPendingCount(localCache.pendingAnswers.length);
          setDeadlineIso(attemptDeadlineAt(localCache.snapshot.attempt));
          setSessionToken(localCache.sessionToken);
          setSyncStatus("offline");
          setLoading(false);
          toast.warning("Loaded cached paper from IndexedDB (offline mode)");
        } else {
          setLoadError(
            err instanceof Error ? err.message : "Could not load exam attempt"
          );
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  // --- Poll Live Examiner Announcements ---
  useEffect(() => {
    if (!examId || !isActiveAttempt || !network.isOnline) return;
    let active = true;

    const fetchAnns = async () => {
      try {
        const res = await api.exams.announcements(examId);
        if (!active) return;
        const list = res.announcements ?? [];
        setAnnouncements((prev) => {
          if (list.length > prev.length && prev.length > 0) {
            toast.info(`Examiner Announcement: ${list[0].message}`);
          }
          return list;
        });
      } catch {
        // ignore polling hiccups
      }
    };

    fetchAnns();
    const id = setInterval(fetchAnns, 15_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [examId, isActiveAttempt, network.isOnline]);

  // --- Log Event Helper (falls back to offline queue if disconnected) ---
  const logIntegrityEvent = useCallback(
    async (
      type: "TAB_BLUR" | "FULLSCREEN_EXIT" | "PASTE" | "COPY_ATTEMPT" | "FAST_ANSWER",
      meta: Record<string, unknown> = {}
    ) => {
      if (!isActiveAttempt) return;
      const at = new Date().toISOString();
      if (!network.isOnline) {
        await enqueueOfflineEvent(attemptId, { type, meta, at });
        return;
      }
      try {
        await api.attempts.logEvent(attemptId, { type, meta, at });
      } catch {
        await enqueueOfflineEvent(attemptId, { type, meta, at });
      }
    },
    [attemptId, isActiveAttempt, network.isOnline]
  );

  // --- Soft-Lock & Privacy-First Indicators ---
  useEffect(() => {
    if (!isActiveAttempt) return;

    const handleVisibility = () => {
      if (document.hidden) {
        setIndicatorCounts((c) => ({ ...c, blurs: c.blurs + 1 }));
        logIntegrityEvent("TAB_BLUR", { reason: "visibilitychange" });
        api.attempts
          .logLockEvent(attemptId, { type: "VIOLATION", meta: { source: "TAB_BLUR" } })
          .then((res) => {
            if (res.escalation) setEscalation(res.escalation);
          })
          .catch(() => {});
      }
    };

    const handleFullscreenChange = () => {
      const nowFs = Boolean(document.fullscreenElement);
      setIsFullscreen(nowFs);
      if (!nowFs) {
        setIndicatorCounts((c) => ({ ...c, fsExits: c.fsExits + 1 }));
        logIntegrityEvent("FULLSCREEN_EXIT");
        api.attempts
          .logLockEvent(attemptId, { type: "VIOLATION", meta: { source: "FULLSCREEN_EXIT" } })
          .then((res) => {
            if (res.escalation) setEscalation(res.escalation);
          })
          .catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [attemptId, isActiveAttempt, logIntegrityEvent]);

  const enterFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
      // Optional Chromium Keyboard Lock API (Section 10.2)
      const navAny = navigator as Navigator & {
        keyboard?: { lock?: (keys?: string[]) => Promise<void> };
      };
      if (navAny.keyboard?.lock) {
        navAny.keyboard.lock(["Escape"]).catch(() => {});
      }
      api.attempts.logLockEvent(attemptId, { type: "LOCK" }).catch(() => {});
    } catch {
      toast.info("Fullscreen request was declined by the browser");
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // ignore
    }
  };

  // --- IndexedDB-First Answer Update ---
  const saveAnswer = useCallback(
    async (
      questionId: string,
      selected: string[] | string,
      marked: boolean,
      debounceMs = 400
    ) => {
      if (!isActiveAttempt) return;

      // Fast-answer indicator check (< 1.5s on hard question)
      const elapsedMs = Date.now() - questionStartRef.current;
      const qObj = questions.find((q) => q.id === questionId);
      if (qObj && qObj.difficulty === 3 && elapsedMs < 1500 && !answers[questionId]) {
        logIntegrityEvent("FAST_ANSWER", { questionId, elapsedMs });
      }

      // 1. Write to IndexedDB FIRST (zero data loss even if tab closes or Wi-Fi drops immediately)
      const { cache } = await enqueueAnswer(attemptId, {
        questionId,
        selected,
        marked,
      });

      setAnswers({ ...cache.latestAnswers });
      setPendingCount(cache.pendingAnswers.length);

      if (!network.isOnline) {
        setSyncStatus("offline");
        return;
      }

      setSyncStatus("saving");
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        flushQueue();
      }, debounceMs);
    },
    [answers, attemptId, flushQueue, isActiveAttempt, logIntegrityEvent, network.isOnline, questions]
  );

  const currentQuestion = questions[currentIdx];

  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [currentIdx]);

  // --- Keyboard Navigation Shortcuts ---
  useEffect(() => {
    if (!isActiveAttempt) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "ArrowRight" && currentIdx < questions.length - 1) {
        setCurrentIdx((i) => i + 1);
      } else if (e.key === "ArrowLeft" && currentIdx > 0 && !noBacktrack) {
        setCurrentIdx((i) => i - 1);
      } else if (e.key.toLowerCase() === "m" && currentQuestion) {
        const cur = answers[currentQuestion.id];
        saveAnswer(
          currentQuestion.id,
          cur?.selected ?? (currentQuestion.type === "WRITTEN" ? "" : []),
          !(cur?.marked ?? false),
          250
        );
      } else if (e.key.toLowerCase() === "s") {
        setScratchpadOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answers, currentIdx, currentQuestion, isActiveAttempt, noBacktrack, questions.length, saveAnswer]);

  // --- Stats for Palette & Submit Modal ---
  const stats = useMemo(() => {
    let answered = 0;
    let marked = 0;
    for (const q of questions) {
      const a = answers[q.id];
      const hasVal = a
        ? Array.isArray(a.selected)
          ? a.selected.length > 0
          : String(a.selected ?? "").trim().length > 0
        : false;
      if (hasVal) answered++;
      if (a?.marked) marked++;
    }
    return { answered, marked, unanswered: questions.length - answered };
  }, [answers, questions]);

  // --- Final Idempotent Submit ---
  async function handleFinalSubmit() {
    setSubmitting(true);
    try {
      if (network.isOnline) {
        await flushQueue({ forceTokenRefresh: true });
      }
      const res = await api.attempts.submit(attemptId);
      setAttempt(res.attempt);
      setConfirmSubmitOpen(false);
      setSubmitReceipt({
        score: res.score,
        maxScore: res.maxScore,
        pendingManualCount: res.pendingManualCount,
        checkpointHash: res.checkpointHash,
        verifyCode: attemptVerifyCode(res.attempt),
      });
      toast.success("Exam submitted & cryptographically checkpointed");
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Cannot submit while offline. Reconnect and try again — all your answers are safe."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRedeemUnlock() {
    if (!unlockCode.trim()) return;
    setUnlocking(true);
    try {
      const res = await api.attempts.redeemUnlockCode(attemptId, unlockCode.trim());
      if (res.deadlineAt) {
        setDeadlineIso(res.deadlineAt);
      }
      setEscalation("OK");
      setUnlockOpen(false);
      setUnlockCode("");
      toast.success("Emergency unlock code accepted & logged");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUnlocking(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <Spinner className="h-5 w-5 text-accent" />
          Preparing frozen exam paper &amp; syncing server clock…
        </div>
      </div>
    );
  }

  if (loadError || !attempt) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <Badge tone="danger">Cannot Open Attempt</Badge>
        <p className="max-w-md text-sm text-ink-muted">{loadError ?? "Attempt not found"}</p>
        <Link href="/candidate">
          <Button variant="secondary">Return to Candidate Portal</Button>
        </Link>
      </div>
    );
  }

  // --- Submitted / Already Completed Screen ---
  if (attempt.status !== "IN_PROGRESS" || submitReceipt) {
    const code = submitReceipt?.verifyCode || attemptVerifyCode(attempt);
    const maxScore = submitReceipt?.maxScore ?? attemptMaxScore(attempt);
    const score = submitReceipt?.score ?? attempt.score;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
        <Card className="w-full max-w-xl">
          <CardHeader className="text-center items-center py-6">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-verified-soft text-verified">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-semibold">Submission Recorded</h1>
            <p className="text-sm text-ink-muted">
              Your answers are sealed in an immutable SHA-256 hash chain with {receipts.length} signed receipt(s).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface-subtle p-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase text-ink-subtle">Attempt Status</p>
                <p className="font-semibold">{attempt.status}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-ink-subtle">Verify Code</p>
                <p className="font-mono font-semibold text-accent">{code || "Generated"}</p>
              </div>
              {score !== null && score !== undefined && (
                <div>
                  <p className="text-xs font-semibold uppercase text-ink-subtle">Auto-Graded Score</p>
                  <p className="font-mono font-semibold">
                    {score} / {maxScore}
                  </p>
                </div>
              )}
              {submitReceipt && submitReceipt.pendingManualCount > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase text-ink-subtle">Manual Review</p>
                  <p>{submitReceipt.pendingManualCount} written question(s) pending</p>
                </div>
              )}
            </div>

            {submitReceipt?.checkpointHash && (
              <div className="rounded-lg border border-verified/30 bg-verified-soft p-3 text-xs">
                <p className="font-semibold text-verified">Signed Checkpoint Hash</p>
                <p className="mt-1 break-all font-mono text-[11px] text-foreground">
                  {submitReceipt.checkpointHash}
                </p>
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-2.5 pt-2">
              <Link href={`/results/${attempt.id}`}>
                <Button>View Results &amp; Receipts</Button>
              </Link>
              {code && (
                <Link href={`/verify/${encodeURIComponent(code)}`}>
                  <Button variant="verified">
                    <ShieldCheck className="h-4 w-4" /> Verify Certificate
                  </Button>
                </Link>
              )}
              <Link href={`/verify?attemptId=${encodeURIComponent(attempt.id)}`}>
                <Button variant="secondary">Inspect Hash Chain</Button>
              </Link>
              <Link href="/candidate">
                <Button variant="ghost">Back to Portal</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const palettePos = prefs.palettePosition ?? "right";
  const latestAnn = announcements[0];
  const showAnnBanner = latestAnn && latestAnn.id !== dismissedAnnId;
  const currentAns = currentQuestion ? answers[currentQuestion.id] : undefined;
  const isSandbox = Boolean(attempt.is_sandbox ?? attempt.isSandbox);

  const PalettePanel = (
    <Card className="h-fit">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Question Palette
          </span>
          <span className="text-xs font-mono text-ink-subtle">
            {stats.answered}/{questions.length}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-5 gap-1.5">
          {questions.map((q, idx) => {
            const a = answers[q.id];
            const isAns = a
              ? Array.isArray(a.selected)
                ? a.selected.length > 0
                : String(a.selected ?? "").trim().length > 0
              : false;
            const isMarked = Boolean(a?.marked);
            const isCurrent = idx === currentIdx;
            const blocked = noBacktrack && idx < currentIdx;

            return (
              <button
                key={q.id}
                type="button"
                disabled={blocked}
                aria-label={`Question ${idx + 1}${isAns ? ", answered" : ", unanswered"}${isMarked ? ", marked for review" : ""}`}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => setCurrentIdx(idx)}
                className={`relative flex h-9 items-center justify-center rounded-lg border text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isCurrent
                    ? "border-accent bg-accent text-accent-ink ring-2 ring-accent/30"
                    : isMarked
                    ? "border-warning bg-warning-soft text-warning"
                    : isAns
                    ? "border-verified/40 bg-verified-soft text-verified"
                    : "border-border bg-surface-subtle text-ink-muted hover:border-border-strong"
                }`}
              >
                {idx + 1}
                {isMarked && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-warning border border-surface"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-1.5 border-t border-border pt-3 text-[11px] text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-verified-soft border border-verified/50" />
            Answered ({stats.answered})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-surface-subtle border border-border" />
            Unanswered ({stats.unanswered})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-warning-soft border border-warning" />
            Review ({stats.marked})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-accent" />
            Current
          </span>
        </div>

        {/* Palette Position & Layout Controls */}
        <div className="border-t border-border pt-3 flex items-center justify-between text-[11px] text-ink-subtle">
          <span className="flex items-center gap-1">
            <LayoutPanelLeft className="h-3.5 w-3.5" /> Palette
          </span>
          <div className="flex gap-1">
            {(["left", "right", "bottom"] as const).map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => updatePrefs({ palettePosition: pos })}
                className={`rounded px-1.5 py-0.5 capitalize ${
                  palettePos === pos
                    ? "bg-accent-soft text-accent font-semibold"
                    : "hover:bg-surface-muted"
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        <Button
          variant="primary"
          className="w-full"
          onClick={() => setConfirmSubmitOpen(true)}
        >
          <Send className="h-4 w-4" /> Submit Exam
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a href="#exam-question" className="skip-link">
        Skip to question
      </a>

      {/* Distraction-Free Sticky Top Bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur-xs">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-ink">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="truncate text-sm font-semibold">{examTitle}</span>
            {isSandbox && (
              <Badge tone="warning">
                <FlaskConical className="h-3 w-3" /> Sandbox
              </Badge>
            )}
          </div>

          {/* Center: Server-Authoritative Countdown Timer */}
          <div
            role="timer"
            aria-live="polite"
            className={`flex items-center gap-2 rounded-lg border px-3 py-1 font-mono text-sm font-bold ${
              clock.isCriticalTime
                ? "border-danger bg-danger-soft text-danger animate-pulse"
                : clock.isLowTime
                ? "border-warning bg-warning-soft text-warning"
                : "border-border bg-surface-subtle text-foreground"
            }`}
            title="Server-synchronized deadline countdown"
          >
            <Clock className="h-4 w-4" />
            <span>{clock.formatted}</span>
          </div>

          {/* Right: Network / Offline Queue Badge + Tools */}
          <div className="flex items-center gap-1.5">
            {/* Network-Aware Autosave Status Badge */}
            <button
              type="button"
              onClick={() => flushQueue({ forceTokenRefresh: true, showToast: true })}
              aria-live="polite"
              title="Click to force sync queued answers"
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                !network.isOnline || syncStatus === "offline"
                  ? "border-warning bg-warning-soft text-warning"
                  : syncStatus === "saving"
                  ? "border-accent/40 bg-accent-soft text-accent"
                  : syncStatus === "error"
                  ? "border-danger bg-danger-soft text-danger"
                  : "border-verified/40 bg-verified-soft text-verified"
              }`}
            >
              {!network.isOnline || syncStatus === "offline" ? (
                <>
                  <CloudOff className="h-3.5 w-3.5" />
                  <span>
                    Offline{pendingCount > 0 ? ` · ${pendingCount} queued` : ""}
                  </span>
                </>
              ) : syncStatus === "saving" ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>
                    Saving{pendingCount > 0 ? ` (${pendingCount})` : "…"}
                  </span>
                </>
              ) : syncStatus === "error" ? (
                <>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Sync Retry ({pendingCount})</span>
                </>
              ) : (
                <>
                  <Cloud className="h-3.5 w-3.5" />
                  <span>Saved</span>
                </>
              )}
            </button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setReceiptsOpen((v) => !v);
                setScratchpadOpen(false);
              }}
              title="View signed cryptographic receipts"
            >
              <FileText className="h-4 w-4 text-verified" />
              <span className="hidden md:inline font-mono">{receipts.length}</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setScratchpadOpen((v) => !v);
                setReceiptsOpen(false);
              }}
              title="Toggle scratchpad (shortcut: S)"
            >
              <NotebookPen className="h-4 w-4" />
              <span className="hidden lg:inline">Scratchpad</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={isFullscreen ? exitFullscreen : enterFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>

            <WorkspacePrefsMenu />
          </div>
        </div>
      </header>

      {/* Banners: Offline Resilience, Unstable Connection, Announcements, Soft Lock Escalation */}
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-6 pt-3 space-y-2">
        {!network.isOnline && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/50 bg-warning-soft px-4 py-2.5 text-xs text-warning"
          >
            <span className="flex items-center gap-2 font-medium">
              <WifiOff className="h-4 w-4 shrink-0" />
              <strong>Offline Mode Active:</strong> Keep answering normally. {pendingCount} answer(s) safely persisted in IndexedDB and queued for automatic sync with signed receipts on reconnect. Server clock continues unchanged.
            </span>
            <Button size="sm" variant="secondary" onClick={() => network.ping()}>
              Retry Connection
            </Button>
          </div>
        )}

        {network.quality === "unstable" && (
          <div className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft/70 px-4 py-2 text-xs text-warning">
            <Wifi className="h-4 w-4" />
            High network latency detected ({network.latencyMs}ms). Answers are saved locally first before syncing.
          </div>
        )}

        {showAnnBanner && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent-soft px-4 py-2.5 text-xs text-accent">
            <span className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 shrink-0" />
              <strong>Examiner Broadcast:</strong> {latestAnn.message}
            </span>
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => setDismissedAnnId(latestAnn.id)}
            >
              Dismiss
            </button>
          </div>
        )}

        {escalation !== "OK" && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/40 bg-surface p-3 text-xs">
            <span className="flex items-center gap-2 text-ink-muted">
              <ShieldAlert className="h-4 w-4 text-warning shrink-0" />
              <span>
                <strong>Integrity Indicator ({escalation}):</strong>{" "}
                {indicatorCounts.blurs} tab switch(es), {indicatorCounts.fsExits} fullscreen exit(s),{" "}
                {indicatorCounts.pastes} paste(s). <em>Indicators are for review, not proof — you are never auto-failed.</em>
              </span>
            </span>
            <div className="flex items-center gap-2">
              {!isFullscreen && (
                <Button size="sm" variant="secondary" onClick={enterFullscreen}>
                  Return to Fullscreen
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setUnlockOpen(true)}>
                <KeyRound className="h-3.5 w-3.5" /> Enter Unlock Code
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Main Workspace Grid */}
      <main
        id="exam-question"
        className={`mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-6 grid gap-5 ${
          palettePos === "bottom"
            ? "grid-cols-1"
            : palettePos === "left"
            ? "lg:grid-cols-[280px_1fr]"
            : "lg:grid-cols-[1fr_280px]"
        }`}
      >
        {palettePos === "left" && <div>{PalettePanel}</div>}

        {/* Active Question Surface */}
        <div className="space-y-4">
          {currentQuestion ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">
                    Question {currentIdx + 1} of {questions.length}
                  </Badge>
                  <Badge tone="neutral">{currentQuestion.type}</Badge>
                  <Badge tone="neutral">{currentQuestion.marks} marks</Badge>
                  {currentQuestion.negativeMarking > 0 && (
                    <Badge tone="warning">−{currentQuestion.negativeMarking} wrong</Badge>
                  )}
                </div>

                <Button
                  size="sm"
                  variant={currentAns?.marked ? "primary" : "secondary"}
                  onClick={() =>
                    saveAnswer(
                      currentQuestion.id,
                      currentAns?.selected ?? (currentQuestion.type === "WRITTEN" ? "" : []),
                      !(currentAns?.marked ?? false),
                      250
                    )
                  }
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  {currentAns?.marked ? "Marked for Review" : "Mark for Review"}
                </Button>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Protected Question Stem (logs copy attempt) */}
                <div
                  className="exam-protected text-base font-medium leading-relaxed text-foreground whitespace-pre-wrap"
                  onCopy={(e) => {
                    e.preventDefault();
                    logIntegrityEvent("COPY_ATTEMPT", { questionId: currentQuestion.id });
                    toast.info("Copying question text is disabled and logged as an indicator");
                  }}
                >
                  {currentQuestion.text}
                </div>

                {/* SINGLE CHOICE */}
                {currentQuestion.type === "SINGLE" && (
                  <fieldset className="space-y-2.5">
                    <legend className="sr-only">Select one answer</legend>
                    {currentQuestion.options.map((opt, idx) => {
                      const selectedArr = Array.isArray(currentAns?.selected)
                        ? currentAns.selected
                        : [];
                      const checked = selectedArr.includes(opt.id);

                      return (
                        <label
                          key={opt.id}
                          className={`flex items-start gap-3 rounded-xl border p-3.5 text-sm transition-colors cursor-pointer ${
                            checked
                              ? "border-accent bg-accent-soft/60 text-foreground font-medium"
                              : "border-border bg-surface-subtle hover:border-border-strong"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q-${currentQuestion.id}`}
                            checked={checked}
                            onChange={() =>
                              saveAnswer(
                                currentQuestion.id,
                                [opt.id],
                                currentAns?.marked ?? false,
                                300
                              )
                            }
                            className="mt-0.5 h-4 w-4 accent-accent"
                          />
                          <span className="font-mono text-xs font-semibold text-ink-subtle mt-0.5">
                            {String.fromCharCode(65 + idx)}.
                          </span>
                          <span className="flex-1">{opt.text}</span>
                        </label>
                      );
                    })}
                  </fieldset>
                )}

                {/* MULTI SELECT */}
                {currentQuestion.type === "MULTI" && (
                  <fieldset className="space-y-2.5">
                    <legend className="text-xs font-medium text-ink-muted mb-1">
                      Select all options that apply (partial credit enabled)
                    </legend>
                    {currentQuestion.options.map((opt, idx) => {
                      const selectedArr = Array.isArray(currentAns?.selected)
                        ? currentAns.selected
                        : [];
                      const checked = selectedArr.includes(opt.id);

                      return (
                        <label
                          key={opt.id}
                          className={`flex items-start gap-3 rounded-xl border p-3.5 text-sm transition-colors cursor-pointer ${
                            checked
                              ? "border-accent bg-accent-soft/60 text-foreground font-medium"
                              : "border-border bg-surface-subtle hover:border-border-strong"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? selectedArr.filter((id) => id !== opt.id)
                                : [...selectedArr, opt.id];
                              saveAnswer(
                                currentQuestion.id,
                                next,
                                currentAns?.marked ?? false,
                                350
                              );
                            }}
                            className="mt-0.5 h-4 w-4 accent-accent"
                          />
                          <span className="font-mono text-xs font-semibold text-ink-subtle mt-0.5">
                            {String.fromCharCode(65 + idx)}.
                          </span>
                          <span className="flex-1">{opt.text}</span>
                        </label>
                      );
                    })}
                  </fieldset>
                )}

                {/* WRITTEN RESPONSE */}
                {currentQuestion.type === "WRITTEN" && (
                  <div className="space-y-2">
                    <Label htmlFor={`written-${currentQuestion.id}`}>Your Written Answer</Label>
                    <Textarea
                      id={`written-${currentQuestion.id}`}
                      rows={8}
                      placeholder="Write a clear, well-reasoned response…"
                      value={typeof currentAns?.selected === "string" ? currentAns.selected : ""}
                      onPaste={(e) => {
                        e.preventDefault();
                        setIndicatorCounts((c) => ({ ...c, pastes: c.pastes + 1 }));
                        logIntegrityEvent("PASTE", { questionId: currentQuestion.id });
                        toast.warning("Paste blocked and logged as an integrity indicator");
                      }}
                      onChange={(e) =>
                        saveAnswer(
                          currentQuestion.id,
                          e.target.value,
                          currentAns?.marked ?? false,
                          900
                        )
                      }
                    />
                  </div>
                )}

                {/* Bottom Question Navigation */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                  <Button
                    variant="secondary"
                    disabled={currentIdx === 0 || noBacktrack}
                    onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </Button>

                  <span className="text-[11px] text-ink-subtle hidden sm:inline">
                    Privacy-first · Indicators, not proof · No webcam or screen recording
                  </span>

                  {currentIdx < questions.length - 1 ? (
                    <Button onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}>
                      Next <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button variant="verified" onClick={() => setConfirmSubmitOpen(true)}>
                      <Send className="h-4 w-4" /> Review &amp; Submit
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-sm text-ink-muted">
                No questions found in this exam snapshot.
              </CardContent>
            </Card>
          )}
        </div>

        {(palettePos === "right" || palettePos === "bottom") && <div>{PalettePanel}</div>}
      </main>

      {/* Drawers */}
      <ScratchpadDrawer
        attemptId={attemptId}
        open={scratchpadOpen}
        onClose={() => setScratchpadOpen(false)}
        isOnline={network.isOnline}
      />

      <ReceiptsDrawer
        attemptId={attemptId}
        receipts={receipts}
        pendingCount={pendingCount}
        open={receiptsOpen}
        onClose={() => setReceiptsOpen(false)}
      />

      {/* Submit Confirmation Modal */}
      {confirmSubmitOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Exam Submission"
        >
          <Card className="w-full max-w-md">
            <CardHeader>
              <h2 className="text-base font-semibold">Confirm Final Submission</h2>
              <p className="text-xs text-ink-muted">
                Submission is idempotent and seals your answer hash chain.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg border border-verified/30 bg-verified-soft p-2.5">
                  <p className="text-lg font-bold text-verified">{stats.answered}</p>
                  <p className="text-ink-muted">Answered</p>
                </div>
                <div className="rounded-lg border border-border bg-surface-subtle p-2.5">
                  <p className="text-lg font-bold">{stats.unanswered}</p>
                  <p className="text-ink-muted">Unanswered</p>
                </div>
                <div className="rounded-lg border border-warning/40 bg-warning-soft p-2.5">
                  <p className="text-lg font-bold text-warning">{stats.marked}</p>
                  <p className="text-ink-muted">For Review</p>
                </div>
              </div>

              {pendingCount > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-xs text-warning">
                  {network.isOnline
                    ? `${pendingCount} locally queued answer(s) will be synced immediately before finalizing.`
                    : `You are currently offline with ${pendingCount} unsynced answer(s). Reconnect before submitting so all answers reach the server.`}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setConfirmSubmitOpen(false)}>
                  Keep Working
                </Button>
                <Button
                  variant="verified"
                  disabled={submitting || !network.isOnline}
                  onClick={handleFinalSubmit}
                >
                  {submitting ? <Spinner /> : "Confirm & Submit"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Emergency Unlock Code Modal */}
      {unlockOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Redeem Emergency Unlock Code"
        >
          <Card className="w-full max-w-sm">
            <CardHeader>
              <h2 className="text-base font-semibold">Redeem Examiner Unlock Code</h2>
              <p className="text-xs text-ink-muted">
                Enter the one-time code issued by your examiner (e.g. K7M4-P9Q2).
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="XXXX-XXXX"
                value={unlockCode}
                onChange={(e) => setUnlockCode(e.target.value.toUpperCase())}
                className="font-mono text-center tracking-widest uppercase"
              />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setUnlockOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={unlocking || !unlockCode.trim()} onClick={handleRedeemUnlock}>
                  {unlocking ? <Spinner /> : "Verify Code"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
