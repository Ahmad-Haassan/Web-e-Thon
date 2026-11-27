"use client";

import Link from "next/link";
import { CheckCircle2, ExternalLink, ShieldCheck, X, XCircle } from "lucide-react";
import type { SignedReceipt } from "@/lib/client/api-types";
import { Badge, Button } from "@/components/ui/primitives";

export function ReceiptsDrawer({
  attemptId,
  receipts,
  pendingCount,
  open,
  onClose,
}: {
  attemptId: string;
  receipts: SignedReceipt[];
  pendingCount: number;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <aside
      aria-label="Signed answer receipts"
      className="fixed right-0 top-14 bottom-0 z-40 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-verified" /> Cryptographic Save Receipts
          </h2>
          <p className="text-[11px] text-ink-subtle">
            {receipts.length} server-signed · {pendingCount} queued locally
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close receipts">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="border-b border-border bg-verified-soft/60 px-4 py-2.5 text-xs text-verified">
        Each synced answer is chained via SHA-256 and HMAC-signed by the server with your monotonic <code className="font-mono">clientSeq</code>.
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {receipts.length === 0 ? (
          <p className="text-xs text-ink-muted py-6 text-center">
            Answer a question to receive your first signed cryptographic receipt.
          </p>
        ) : (
          receipts.map((r) => (
            <div
              key={`${r.clientSeq}-${r.sig}`}
              className="rounded-lg border border-border bg-surface-subtle p-3 text-xs space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold text-foreground">
                  Seq #{r.clientSeq}
                </span>
                {r.accepted !== false ? (
                  <Badge tone="verified">
                    <CheckCircle2 className="h-3 w-3" /> Accepted
                  </Badge>
                ) : (
                  <Badge tone="danger">
                    <XCircle className="h-3 w-3" /> {r.rejectReason || "Rejected"}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-ink-subtle">
                Server time: {new Date(r.serverTime).toLocaleTimeString()}
              </p>
              <p className="truncate font-mono text-[10px] text-ink-muted" title={r.answerHash}>
                Hash: {r.answerHash}
              </p>
              <p className="truncate font-mono text-[10px] text-ink-subtle" title={r.sig}>
                Sig: {r.sig}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border p-3">
        <Link
          href={`/verify?attemptId=${encodeURIComponent(attemptId)}`}
          target="_blank"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-subtle py-2 text-xs font-semibold text-accent hover:bg-surface-muted"
        >
          Inspect Public Hash Chain <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </aside>
  );
}
