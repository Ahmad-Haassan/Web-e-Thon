"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getBrowserSupabase(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) are not configured."
    );
  }

  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}

/**
 * Returns the cached access token without forcing a network round-trip.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Explicitly refreshes the Supabase JWT before syncing queued offline answers
 * (plan.md Section 11.5: refresh token first, never discard queued answers).
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getBrowserSupabase();
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      const fallback = await supabase.auth.getSession();
      return fallback.data.session?.access_token ?? null;
    }
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
