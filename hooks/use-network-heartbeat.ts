"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";

export type ConnectionQuality = "online" | "unstable" | "offline";

export function useNetworkHeartbeat(options?: {
  enabled?: boolean;
  intervalMs?: number;
  onDisconnect?: () => void;
  onReconnect?: (serverNow?: number) => void;
}) {
  const enabled = options?.enabled ?? true;
  const intervalMs = options?.intervalMs ?? 12_000;

  const [quality, setQuality] = useState<ConnectionQuality>("online");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const prevOfflineRef = useRef(false);
  const onDisconnectRef = useRef(options?.onDisconnect);
  const onReconnectRef = useRef(options?.onReconnect);

  useEffect(() => {
    onDisconnectRef.current = options?.onDisconnect;
    onReconnectRef.current = options?.onReconnect;
  }, [options?.onDisconnect, options?.onReconnect]);

  const markOffline = useCallback(() => {
    setQuality("offline");
    setLatencyMs(null);
    if (!prevOfflineRef.current) {
      prevOfflineRef.current = true;
      onDisconnectRef.current?.();
    }
  }, []);

  const ping = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      markOffline();
      return false;
    }

    const start = Date.now();
    try {
      const res = await api.time.get();
      const rtt = Date.now() - start;
      setLatencyMs(rtt);
      setQuality(rtt > 2500 ? "unstable" : "online");
      if (prevOfflineRef.current) {
        prevOfflineRef.current = false;
        onReconnectRef.current?.(res.now);
      }
      return true;
    } catch {
      markOffline();
      return false;
    }
  }, [markOffline]);

  useEffect(() => {
    if (!enabled) return;

    const handleOffline = () => markOffline();
    const handleOnline = () => {
      ping();
    };

    const init = setTimeout(() => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        markOffline();
      } else {
        void ping();
      }
    }, 0);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    const id = setInterval(() => {
      void ping();
    }, intervalMs);

    return () => {
      clearTimeout(init);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      clearInterval(id);
    };
  }, [enabled, intervalMs, markOffline, ping]);

  return {
    quality,
    isOnline: quality !== "offline",
    latencyMs,
    ping,
  };
}
