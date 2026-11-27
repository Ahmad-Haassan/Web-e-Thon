"use client";

import { useState } from "react";
import { Check, Clock, Cloud, CloudOff, ShieldCheck, Wifi, WifiOff } from "lucide-react";

const SAMPLE_OPTIONS = [
  { id: "a", label: "A", text: "Hash indexes cannot store timestamps" },
  { id: "b", label: "B", text: "B+ tree leaf nodes are linked in sorted key order" },
  { id: "c", label: "C", text: "B+ trees always fit in CPU L1 cache" },
  { id: "d", label: "D", text: "Hash indexes do not support equality lookups" },
];

export function HeroProductPreview() {
  const [selected, setSelected] = useState<string>("b");
  const [offline, setOffline] = useState(false);
  const [seq, setSeq] = useState(14);
  const [queued, setQueued] = useState(0);
  const [hashTail, setHashTail] = useState("9f4a8e2c71b0d53e");

  function handleSelect(id: string) {
    setSelected(id);
    const nextSeq = seq + 1;
    setSeq(nextSeq);
    if (offline) {
      setQueued((q) => q + 1);
    } else {
      setHashTail(
        ((nextSeq * 2654435761 + id.charCodeAt(0) * 97) >>> 0)
          .toString(16)
          .padStart(8, "0") + "c4e91a0d"
      );
    }
  }

  function toggleNetwork() {
    if (offline) {
      setOffline(false);
      setQueued(0);
      setHashTail(((seq * 1597334677) >>> 0).toString(16).padStart(8, "0") + "7b2f4d91");
    } else {
      setOffline(true);
    }
  }

  return (
    <div className="rounded-sm border border-border bg-surface p-5 sm:p-6 surface-elevated">
      {/* Top workspace chrome */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
              offline ? "bg-warning" : "bg-verified"
            }`}
          />
          <span className="font-display text-xs font-semibold uppercase tracking-[0.05em] text-foreground truncate">
            CS-301 Midterm · Q7 of 20
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-subtle px-2.5 py-1 font-mono text-xs font-medium text-foreground tabular-nums">
            <Clock className="h-3.5 w-3.5 text-ink-subtle" strokeWidth={1.6} />
            41:18
          </span>
          <button
            type="button"
            onClick={toggleNetwork}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${
              offline
                ? "border-warning/30 bg-warning-soft text-warning"
                : "border-verified/25 bg-verified-soft text-verified"
            }`}
            title="Click to simulate disconnecting and reconnecting Wi-Fi"
          >
            {offline ? (
              <>
                <CloudOff className="h-3.5 w-3.5" strokeWidth={1.6} />
                Offline{queued > 0 ? ` · ${queued} queued` : ""}
              </>
            ) : (
              <>
                <Cloud className="h-3.5 w-3.5" strokeWidth={1.6} />
                Saved
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live interactive question */}
      <div className="mt-5 space-y-4">
        <p className="text-sm font-medium leading-relaxed text-foreground">
          Why does a B+ tree outperform a hash index for range queries such as{" "}
          <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs">
            BETWEEN t1 AND t2
          </code>
          ?
        </p>

        <div className="space-y-2">
          {SAMPLE_OPTIONS.map((opt) => {
            const active = selected === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelect(opt.id)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-xs sm:text-sm cursor-pointer transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.99] ${
                  active
                    ? "border-accent bg-accent-soft text-foreground font-medium"
                    : "border-border bg-surface-subtle text-ink-muted hover:border-border-strong hover:text-foreground"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border font-mono text-xs ${
                    active
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-border bg-surface text-ink-subtle"
                  }`}
                >
                  {active ? <Check className="h-3 w-3" strokeWidth={2.2} /> : opt.label}
                </span>
                <span className="flex-1">{opt.text}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom cryptographic receipt stamp + interactive disconnect toggle */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-surface-subtle px-3.5 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck
            className={`h-4 w-4 shrink-0 ${offline ? "text-warning" : "text-verified"}`}
            strokeWidth={1.6}
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">
              {offline
                ? `Persisted in IndexedDB · clientSeq #${seq}`
                : `Signed receipt #${seq} verified`}
            </p>
            <p className="truncate font-mono text-xs text-ink-subtle tabular-nums">
              {offline
                ? "Awaiting reconnect to seal hash chain"
                : `sha256: ${hashTail}…`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleNetwork}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-muted transition-[background-color,transform] duration-150 active:scale-[0.97] cursor-pointer"
        >
          {offline ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-verified" strokeWidth={1.6} />
              Reconnect
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-warning" strokeWidth={1.6} />
              Test offline
            </>
          )}
        </button>
      </div>
    </div>
  );
}
