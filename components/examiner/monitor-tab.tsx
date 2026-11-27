"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  KeyRound,
  Megaphone,
  RefreshCw,
  ShieldAlert,
  WifiOff,
  Wrench,
} from "lucide-react";
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
  Spinner,
} from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import type { MonitorAttemptRow } from "@/lib/client/api-types";

export function MonitorTab({ examId }: { examId: string }) {
  const qc = useQueryClient();
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [announcementMsg, setAnnouncementMsg] = useState("");

  // Emergency Unlock Modal state
  const [unlockTarget, setUnlockTarget] = useState<MonitorAttemptRow | null>(null);
  const [unlockReason, setUnlockReason] = useState("Browser crash / network recovery");
  const [extraSec, setExtraSec] = useState("0");
  const [issuedCode, setIssuedCode] = useState<{
    code: string;
    expiresAt: string;
    grantExtraSec: number;
  } | null>(null);

  const monitorQuery = useQuery({
    queryKey: ["exam-monitor", examId],
    queryFn: () => api.exams.monitor(examId),
    refetchInterval: 5_000,
  });

  const postAnnouncementMut = useMutation({
    mutationFn: (msg: string) => api.exams.postAnnouncement(examId, msg),
    onSuccess: () => {
      toast.success("Announcement broadcast to all candidates");
      setAnnouncementMsg("");
      qc.invalidateQueries({ queryKey: ["exam-monitor", examId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const unlockMut = useMutation({
    mutationFn: ({
      attemptId,
      reason,
      grantExtraSec,
    }: {
      attemptId: string;
      reason: string;
      grantExtraSec: number;
    }) =>
      api.attempts.issueUnlockCode(attemptId, {
        reason,
        expiresInSec: 120,
        grantExtraSec,
      }),
    onSuccess: (res) => {
      setIssuedCode(res);
      toast.success("One-time unlock code generated (shown once)");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const incidentMut = useMutation({
    mutationFn: (attemptId: string) =>
      api.attempts.logEvent(attemptId, {
        type: "TECHNICAL_INCIDENT",
        meta: { loggedBy: "EXAMINER", note: "Verified connectivity/device incident during exam" },
      }),
    onSuccess: () => {
      toast.success("Technical incident logged into attempt hash chain");
      qc.invalidateQueries({ queryKey: ["exam-monitor", examId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const attempts = monitorQuery.data?.attempts ?? [];
  const flaggedQueue = monitorQuery.data?.flaggedQueue ?? [];
  const announcements = monitorQuery.data?.announcements ?? [];

  const rows = onlyFlagged ? flaggedQueue : attempts;

  function formatProgress(row: MonitorAttemptRow): string {
    if (typeof row.progress === "object" && row.progress) {
      return `${row.progress.answered}/${row.progress.total}`;
    }
    if (row.answeredCount !== undefined && row.totalQuestions !== undefined) {
      return `${row.answeredCount}/${row.totalQuestions}`;
    }
    if (typeof row.progress === "number") {
      return `${Math.round(row.progress)}%`;
    }
    return "—";
  }

  function handleAnnouncement(e: FormEvent) {
    e.preventDefault();
    if (!announcementMsg.trim()) return;
    postAnnouncementMut.mutate(announcementMsg.trim());
  }

  return (
    <div className="space-y-5">
      {/* Privacy-first disclaimer banner */}
      <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent-soft p-4 text-sm text-accent">
        <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">
            Privacy-First Integrity Monitoring — Indicators, Not Proof
          </p>
          <p className="text-xs opacity-90 mt-0.5">
            No webcam or screen recording is collected. Tab switches, fullscreen exits, paste attempts, and disconnect durations are cryptographically chained signals for human examiner review — never automated failure.
          </p>
        </div>
      </div>

      {/* Live Announcements */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <Megaphone className="h-4 w-4 text-accent" /> Live Announcements Broadcast
            </h3>
            <span className="text-xs text-ink-subtle">Auto-refreshes every 5s</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={handleAnnouncement} className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Broadcast a clarification or time reminder to all active candidates…"
              value={announcementMsg}
              onChange={(e) => setAnnouncementMsg(e.target.value)}
            />
            <Button type="submit" disabled={postAnnouncementMut.isPending} className="shrink-0">
              {postAnnouncementMut.isPending ? <Spinner /> : "Send Broadcast"}
            </Button>
          </form>

          {announcements.length > 0 && (
            <div className="space-y-1.5 max-h-32 overflow-y-auto pt-1">
              {announcements.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs"
                >
                  <span className="text-foreground">{a.message}</span>
                  <span className="shrink-0 text-ink-subtle">
                    {a.at ? formatDistanceToNow(new Date(a.at), { addSuffix: true }) : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Attempts Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">
                Live Attempts ({attempts.length}) · Flagged Queue ({flaggedQueue.length})
              </h3>
              <p className="text-xs text-ink-muted">
                Sandbox attempts are excluded automatically.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={onlyFlagged ? "primary" : "secondary"}
                onClick={() => setOnlyFlagged((v) => !v)}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {onlyFlagged ? "Showing Flagged Only" : `Flagged Queue (${flaggedQueue.length})`}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => monitorQuery.refetch()}
                disabled={monitorQuery.isFetching}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${monitorQuery.isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {monitorQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-muted">
              <Spinner /> Connecting to live telemetry…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={onlyFlagged ? "No flagged attempts" : "No active attempts yet"}
                description={
                  onlyFlagged
                    ? "Zero candidates have crossed the integrity indicator threshold."
                    : "Attempts will appear here in real time once enrolled candidates begin the exam."
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-surface-subtle uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Candidate</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3">Last Seen</th>
                    <th className="px-4 py-3">Indicators (Not Proof)</th>
                    <th className="px-4 py-3 text-right">Examiner Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const attemptId = r.attemptId ?? r.id;
                    const name = r.candidate?.name ?? r.candidateName ?? "Candidate";
                    const email = r.candidate?.email ?? r.candidateEmail ?? "";
                    const lastSeen = r.lastSeenAt ?? r.last_seen_at;
                    const ind = r.indicators ?? {};
                    const hasFlags =
                      (ind.tabBlurs ?? 0) +
                        (ind.fullscreenExits ?? 0) +
                        (ind.pasteEvents ?? 0) +
                        (ind.lockViolations ?? 0) >
                      0;

                    return (
                      <tr key={attemptId} className="hover:bg-surface-subtle/60">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground text-sm">{name}</p>
                          <p className="text-ink-subtle">{email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              r.status === "IN_PROGRESS"
                                ? "accent"
                                : r.status === "GRADED" || r.status === "SUBMITTED"
                                ? "verified"
                                : "warning"
                            }
                          >
                            {r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-foreground">
                          {formatProgress(r)}
                        </td>
                        <td className="px-4 py-3 text-ink-muted">
                          {lastSeen
                            ? formatDistanceToNow(new Date(lastSeen), { addSuffix: true })
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {hasFlags ? (
                              <>
                                {(ind.tabBlurs ?? 0) > 0 && (
                                  <Badge tone="warning">Blur: {ind.tabBlurs}</Badge>
                                )}
                                {(ind.fullscreenExits ?? 0) > 0 && (
                                  <Badge tone="warning">FS Exit: {ind.fullscreenExits}</Badge>
                                )}
                                {(ind.pasteEvents ?? 0) > 0 && (
                                  <Badge tone="danger">Paste: {ind.pasteEvents}</Badge>
                                )}
                                {(ind.lockViolations ?? 0) > 0 && (
                                  <Badge tone="danger">Lock: {ind.lockViolations}</Badge>
                                )}
                              </>
                            ) : (
                              <Badge tone="verified">Clean</Badge>
                            )}
                            {(ind.disconnects ?? 0) > 0 && (
                              <Badge tone="neutral">
                                <WifiOff className="h-3 w-3" /> {ind.disconnects} ({ind.totalOfflineSec ?? 0}s)
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setUnlockTarget(r);
                                setIssuedCode(null);
                              }}
                            >
                              <KeyRound className="h-3.5 w-3.5" /> Unlock Code
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Log verified technical incident for dispute trail"
                              onClick={() => incidentMut.mutate(attemptId)}
                            >
                              <Wrench className="h-3.5 w-3.5" /> Incident
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Emergency Unlock Code Modal */}
      {unlockTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Issue One-Time Emergency Unlock Code"
        >
          <Card className="w-full max-w-md">
            <CardHeader>
              <h3 className="text-base font-semibold">Issue One-Time Emergency Unlock Code</h3>
              <p className="text-xs text-ink-muted">
                Bound to{" "}
                <strong>
                  {unlockTarget.candidate?.name ?? unlockTarget.candidateName ?? "Candidate"}
                </strong>
                . Valid for 2 minutes, stored hashed, logged in audit trail.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {issuedCode ? (
                <div className="space-y-3 rounded-xl border border-verified/40 bg-verified-soft p-4 text-center">
                  <p className="text-xs font-semibold uppercase text-verified">
                    One-Time Unlock Code (Shown Once)
                  </p>
                  <p className="font-mono text-3xl font-bold tracking-widest text-foreground select-all">
                    {issuedCode.code}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Expires at {new Date(issuedCode.expiresAt).toLocaleTimeString()}
                    {issuedCode.grantExtraSec > 0
                      ? ` · Grants +${issuedCode.grantExtraSec}s audited extension`
                      : " · No extra time granted"}
                  </p>
                  <Button
                    className="w-full"
                    onClick={() => {
                      setUnlockTarget(null);
                      setIssuedCode(null);
                    }}
                  >
                    Done
                  </Button>
                </div>
              ) : (
                <>
                  <div>
                    <Label htmlFor="unlock-reason">Audited Reason</Label>
                    <Input
                      id="unlock-reason"
                      value={unlockReason}
                      onChange={(e) => setUnlockReason(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="unlock-extra">
                      Explicit Extra Time in Seconds (0 = timer unchanged)
                    </Label>
                    <Input
                      id="unlock-extra"
                      type="number"
                      min={0}
                      max={3600}
                      value={extraSec}
                      onChange={(e) => setExtraSec(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setUnlockTarget(null)}>
                      Cancel
                    </Button>
                    <Button
                      disabled={unlockMut.isPending}
                      onClick={() =>
                        unlockMut.mutate({
                          attemptId: unlockTarget.attemptId ?? unlockTarget.id,
                          reason: unlockReason.trim() || "Examiner emergency unlock",
                          grantExtraSec: Math.max(0, Number(extraSec) || 0),
                        })
                      }
                    >
                      {unlockMut.isPending ? <Spinner /> : "Generate Code"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
