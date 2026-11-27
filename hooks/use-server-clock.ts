"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";

export function formatCountdown(remainingMs: number): string {
  const totalSec = Math.max(0, Math.floor(remainingMs / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(mins)}:${pad(secs)}`;
}

export function useServerClock(
  deadlineIso: string | null,
  options?: {
    enabled?: boolean;
    onExpired?: () => void;
  }
) {
  const enabled = options?.enabled ?? true;
  const onExpiredRef = useRef(options?.onExpired);

  useEffect(() => {
    onExpiredRef.current = options?.onExpired;
  }, [options?.onExpired]);

  const [offsetMs, setOffsetMs] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const expiredFiredRef = useRef(false);

  const syncFromServerNow = useCallback((serverNow: number | string) => {
    const serverMs = typeof serverNow === "number" ? serverNow : new Date(serverNow).getTime();
    if (!Number.isNaN(serverMs)) {
      setOffsetMs(serverMs - Date.now());
      setLastSyncedAt(Date.now());
    }
  }, []);

  const syncWithApi = useCallback(async () => {
    try {
      const t0 = Date.now();
      const res = await api.time.get();
      const t1 = Date.now();
      const rttHalf = Math.round((t1 - t0) / 2);
      const serverMs =
        typeof res.now === "number" ? res.now : new Date(res.iso).getTime();
      if (!Number.isNaN(serverMs)) {
        setOffsetMs(serverMs + rttHalf - t1);
        setLastSyncedAt(t1);
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  // Periodic server-time synchronization
  useEffect(() => {
    if (!enabled) return;
    const init = setTimeout(() => {
      void syncWithApi();
    }, 0);
    const id = setInterval(() => {
      void syncWithApi();
    }, 30_000);
    return () => {
      clearTimeout(init);
      clearInterval(id);
    };
  }, [enabled, syncWithApi]);

  // Reset expired flag when deadline changes (e.g. audited unlock extra time)
  useEffect(() => {
    expiredFiredRef.current = false;
  }, [deadlineIso]);

  // 250ms tick against server-offset clock
  useEffect(() => {
    if (!enabled || !deadlineIso) return;
    const deadlineMs = new Date(deadlineIso).getTime();
    if (Number.isNaN(deadlineMs)) return;

    const tick = () => {
      const serverNowEst = Date.now() + offsetMs;
      const diff = Math.max(0, deadlineMs - serverNowEst);
      setRemainingMs(diff);
      if (diff <= 0 && !expiredFiredRef.current) {
        expiredFiredRef.current = true;
        onExpiredRef.current?.();
      }
    };

    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [enabled, deadlineIso, offsetMs]);

  return {
    offsetMs,
    lastSyncedAt,
    remainingMs,
    formatted: remainingMs !== null ? formatCountdown(remainingMs) : "--:--",
    isLowTime: remainingMs !== null && remainingMs <= 5 * 60_000 && remainingMs > 60_000,
    isCriticalTime: remainingMs !== null && remainingMs <= 60_000,
    isExpired: remainingMs !== null && remainingMs <= 0,
    syncWithApi,
    syncFromServerNow,
  };
}
