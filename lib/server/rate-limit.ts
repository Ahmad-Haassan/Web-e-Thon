import { HttpError } from "./auth";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Simple in-memory fixed-window rate limiter (zero external billing;
 * swap with @upstash/ratelimit for multi-region serverless if desired).
 */
export function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  existing.count += 1;
  if (existing.count > limit) {
    throw new HttpError(429, "Too many requests, please retry shortly");
  }

  // Opportunistic cleanup so memory stays bounded
  if (buckets.size > 5000) {
    for (const [k, b] of buckets.entries()) {
      if (now >= b.resetAt) buckets.delete(k);
    }
  }
}
