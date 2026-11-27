"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  FileWarning,
  Scale,
  ShieldCheck,
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
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/client/api";
import type { DisputeStatus } from "@/lib/client/api-types";

function statusTone(st: DisputeStatus) {
  switch (st) {
    case "OPEN":
      return "warning" as const;
    case "REJECTED":
      return "danger" as const;
    default:
      return "verified" as const;
  }
}

export default function DisputesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Examiner resolution form
  const [resStatus, setResStatus] = useState<Exclude<DisputeStatus, "OPEN">>("REGRADED");
  const [resNote, setResNote] = useState("");
  const [newAwarded, setNewAwarded] = useState("");

  const listQuery = useQuery({
    queryKey: ["disputes", statusFilter],
    queryFn: () => api.disputes.list({ status: statusFilter || undefined }),
  });

  const detailQuery = useQuery({
    queryKey: ["dispute-detail", selectedId],
    queryFn: () => api.disputes.get(selectedId!),
    enabled: Boolean(selectedId),
  });

  const resolveMut = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: {
        status: Exclude<DisputeStatus, "OPEN">;
        resolution: string;
        newAwarded?: number;
      };
    }) => api.disputes.resolve(id, body),
    onSuccess: (res) => {
      toast.success(
        `Dispute resolved (${res.dispute.status})${
          res.rescoredAttemptsCount
            ? ` · Fairly re-scored ${res.rescoredAttemptsCount} candidate attempt(s)`
            : ""
        }`
      );
      setResNote("");
      setNewAwarded("");
      qc.invalidateQueries({ queryKey: ["disputes"] });
      qc.invalidateQueries({ queryKey: ["dispute-detail", selectedId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disputes = listQuery.data?.disputes ?? [];
  const detail = detailQuery.data;
  const isStaff = user?.role === "ADMIN" || user?.role === "EXAMINER";

  function handleResolve(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    if (resNote.trim().length < 3) {
      toast.error("Please provide an audited resolution reason");
      return;
    }
    resolveMut.mutate({
      id: selectedId,
      body: {
        status: resStatus,
        resolution: resNote.trim(),
        newAwarded:
          resStatus === "REGRADED" && newAwarded !== "" ? Number(newAwarded) : undefined,
      },
    });
  }

  return (
    <AppShell
      title="Disputes & Evidence Timeline"
      subtitle="Transparent, audit-logged dispute resolution backed by hash-chained saves, disconnect records, and signed receipts."
    >
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Left List */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Disputes ({disputes.length})</h2>
              <Select
                aria-label="Filter disputes by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 w-40 text-xs"
              >
                <option value="">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="REGRADED">Regraded</option>
                <option value="AMBIGUOUS_ACCEPTED">Ambiguous Accepted</option>
                <option value="TECHNICAL_REMEDY">Technical Remedy</option>
                <option value="REJECTED">Rejected</option>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {listQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-muted">
                <Spinner /> Loading disputes…
              </div>
            ) : disputes.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<Scale className="h-8 w-8" />}
                  title="No disputes found"
                  description="Candidates can raise disputes from any published result page."
                />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {disputes.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                      selectedId === d.id
                        ? "bg-accent-soft/60"
                        : "hover:bg-surface-subtle"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Badge tone="accent">{d.type}</Badge>
                      <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                    </div>
                    <p className="text-sm font-medium text-foreground line-clamp-2">
                      {d.reason}
                    </p>
                    <p className="mt-1 text-xs text-ink-subtle">
                      {d.exam?.title ? `${d.exam.title} · ` : ""}
                      {d.candidate?.name ? `${d.candidate.name} · ` : ""}
                      {d.created_at ?? d.createdAt
                        ? new Date(d.created_at ?? d.createdAt ?? "").toLocaleString()
                        : ""}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Evidence Timeline & Resolution */}
        <Card className="lg:col-span-7">
          <CardHeader>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <FileWarning className="h-4 w-4 text-accent" /> Evidence Timeline &amp; Resolution
            </h2>
          </CardHeader>
          <CardContent>
            {!selectedId ? (
              <EmptyState
                title="Select a dispute to inspect"
                description="View the chronological hash-chained evidence timeline (saves, disconnects, integrity signals, signed receipts) and resolution details."
              />
            ) : detailQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-muted">
                <Spinner /> Reconstructing evidence timeline…
              </div>
            ) : detailQuery.error || !detail ? (
              <p className="text-sm text-danger">
                {(detailQuery.error as Error)?.message ?? "Failed to load dispute"}
              </p>
            ) : (
              <div className="space-y-5">
                <div className="rounded-xl border border-border bg-surface-subtle p-4 space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="accent">{detail.dispute.type}</Badge>
                    <Badge tone={statusTone(detail.dispute.status)}>{detail.dispute.status}</Badge>
                  </div>
                  <p className="font-medium text-foreground">{detail.dispute.reason}</p>
                  {detail.dispute.resolution && (
                    <div className="mt-2 rounded-lg border border-verified/30 bg-verified-soft p-2.5 text-xs text-verified">
                      <strong>Resolution:</strong> {detail.dispute.resolution}
                    </div>
                  )}
                </div>

                {/* Answer & Official Key (Examiner only) */}
                {(detail.answer || detail.key) && (
                  <div className="grid gap-3 sm:grid-cols-2 text-xs">
                    {detail.answer && (
                      <div className="rounded-lg border border-border bg-surface-subtle p-3">
                        <p className="font-semibold uppercase text-ink-subtle mb-1">
                          Candidate Recorded Answer
                        </p>
                        <p className="font-mono break-words">
                          {JSON.stringify(detail.answer.selected)}
                        </p>
                      </div>
                    )}
                    {detail.key && (
                      <div className="rounded-lg border border-verified/30 bg-verified-soft/50 p-3">
                        <p className="font-semibold uppercase text-verified mb-1">
                          Official Answer Key (Examiner View)
                        </p>
                        <p className="font-mono break-words">
                          {JSON.stringify(
                            detail.key.correctOptionIds ??
                              detail.key.correct_option_ids ??
                              detail.key.writtenRubric ??
                              detail.key.written_rubric ??
                              "—"
                          )}
                        </p>
                        {detail.key.explanation && (
                          <p className="mt-1 text-ink-muted">{detail.key.explanation}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Chronological Evidence Timeline */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2.5">
                    Chronological Evidence Timeline ({detail.evidenceTimeline?.length ?? 0} events)
                  </h3>
                  <ol className="space-y-2 border-l-2 border-border pl-4 max-h-72 overflow-y-auto">
                    {(detail.evidenceTimeline ?? []).map((ev, i) => (
                      <li key={i} className="relative rounded-lg border border-border bg-surface-subtle p-2.5 text-xs">
                        <span className="absolute -left-[22px] top-3 h-2.5 w-2.5 rounded-full bg-accent border-2 border-surface" />
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">{ev.type}</span>
                          <span className="flex items-center gap-1 text-[11px] text-ink-subtle">
                            <Clock className="h-3 w-3" />
                            {new Date(ev.at).toLocaleTimeString()}
                          </span>
                        </div>
                        {ev.summary && <p className="mt-0.5 text-ink-muted">{ev.summary}</p>}
                        {ev.hash && (
                          <p className="mt-0.5 truncate font-mono text-[10px] text-ink-subtle">
                            Hash: {ev.hash}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Signed Receipts Count */}
                {detail.receipts && detail.receipts.length > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-verified/30 bg-verified-soft/60 px-3 py-2 text-xs text-verified">
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    <span>
                      {detail.receipts.length} HMAC-signed server save receipt(s) attached to this attempt.
                    </span>
                  </div>
                )}

                {/* Examiner Resolution Form */}
                {isStaff && detail.dispute.status === "OPEN" && (
                  <form
                    onSubmit={handleResolve}
                    className="space-y-3 rounded-xl border border-accent/30 bg-accent-soft/30 p-4"
                  >
                    <h3 className="text-sm font-semibold">Resolve Dispute (Writes to AuditLog)</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="res-status">Outcome</Label>
                        <Select
                          id="res-status"
                          value={resStatus}
                          onChange={(e) =>
                            setResStatus(e.target.value as Exclude<DisputeStatus, "OPEN">)
                          }
                        >
                          <option value="REGRADED">Regrade This Answer</option>
                          <option value="AMBIGUOUS_ACCEPTED">
                            Accept Ambiguous (Re-score ALL Candidates Fairly)
                          </option>
                          <option value="TECHNICAL_REMEDY">Technical Remedy</option>
                          <option value="REJECTED">Reject Dispute</option>
                        </Select>
                      </div>

                      {resStatus === "REGRADED" && (
                        <div>
                          <Label htmlFor="res-awarded">New Awarded Marks</Label>
                          <Input
                            id="res-awarded"
                            type="number"
                            min={0}
                            step={0.5}
                            required
                            placeholder="e.g. 2"
                            value={newAwarded}
                            onChange={(e) => setNewAwarded(e.target.value)}
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="res-note">Audited Resolution Rationale</Label>
                      <Textarea
                        id="res-note"
                        required
                        rows={2}
                        placeholder="Document why this outcome was chosen (visible to candidate)…"
                        value={resNote}
                        onChange={(e) => setResNote(e.target.value)}
                      />
                    </div>

                    <Button type="submit" disabled={resolveMut.isPending}>
                      {resolveMut.isPending ? <Spinner /> : "Finalize Resolution"}
                    </Button>
                  </form>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
