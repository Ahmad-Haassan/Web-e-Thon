"use client";

import { get, set, del } from "idb-keyval";
import type {
  AttemptSummary,
  ClientSnapshotQuestion,
  SignedReceipt,
} from "@/lib/client/api-types";

export interface QueuedAnswer {
  questionId: string;
  selected: string[] | string;
  marked: boolean;
  clientSeq: number;
  savedAt: string; // ISO timestamp
}

export interface QueuedEvent {
  type:
    | "TAB_BLUR"
    | "FULLSCREEN_EXIT"
    | "PASTE"
    | "COPY_ATTEMPT"
    | "DISCONNECT"
    | "RECONNECT"
    | "SAVE"
    | "TECHNICAL_INCIDENT"
    | "FAST_ANSWER";
  meta: Record<string, unknown>;
  at: string;
}

export interface LocalAnswerState {
  selected: string[] | string;
  marked: boolean;
  savedAt: string;
  clientSeq: number;
}

export interface AttemptOfflineCache {
  attemptId: string;
  nextClientSeq: number;
  latestAnswers: Record<string, LocalAnswerState>;
  pendingAnswers: QueuedAnswer[];
  pendingEvents: QueuedEvent[];
  receipts: SignedReceipt[];
  sessionToken?: string;
  offlineSinceMs: number | null;
  snapshot?: {
    attempt: AttemptSummary;
    questions: ClientSnapshotQuestion[];
  };
  updatedAt: string;
}

const KEY_PREFIX = "veriexam:attempt:";
const memoryFallback = new Map<string, AttemptOfflineCache>();

function keyFor(attemptId: string) {
  return `${KEY_PREFIX}${attemptId}`;
}

export function createEmptyCache(attemptId: string): AttemptOfflineCache {
  return {
    attemptId,
    nextClientSeq: 1,
    latestAnswers: {},
    pendingAnswers: [],
    pendingEvents: [],
    receipts: [],
    offlineSinceMs: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadAttemptCache(attemptId: string): Promise<AttemptOfflineCache> {
  try {
    const existing = await get<AttemptOfflineCache>(keyFor(attemptId));
    if (existing) return existing;
  } catch {
    const mem = memoryFallback.get(attemptId);
    if (mem) return mem;
  }
  return createEmptyCache(attemptId);
}

export async function saveAttemptCache(cache: AttemptOfflineCache): Promise<void> {
  const next: AttemptOfflineCache = { ...cache, updatedAt: new Date().toISOString() };
  memoryFallback.set(cache.attemptId, next);
  try {
    await set(keyFor(cache.attemptId), next);
  } catch {
    // IndexedDB unavailable; memory fallback already populated
  }
}

/**
 * Merges server-confirmed savedAnswers + receipts into IndexedDB cache without
 * overwriting newer unsynced local changes (strictly compares clientSeq).
 */
export async function hydrateAttemptCache(
  attemptId: string,
  payload: {
    attempt: AttemptSummary;
    questions: ClientSnapshotQuestion[];
    savedAnswers?: Array<{
      questionId?: string;
      question_id?: string;
      selected: string[] | string;
      marked?: boolean;
      clientSeq?: number;
      client_seq?: number;
      savedAt?: string;
      saved_at?: string;
    }>;
    receipts?: SignedReceipt[];
    sessionToken?: string;
  }
): Promise<AttemptOfflineCache> {
  const cache = await loadAttemptCache(attemptId);
  let maxSeq = Math.max(0, cache.nextClientSeq - 1);

  for (const ans of payload.savedAnswers ?? []) {
    const qId = ans.questionId ?? ans.question_id;
    if (!qId) continue;
    const seq = Number(ans.clientSeq ?? ans.client_seq ?? 0);
    if (seq > maxSeq) maxSeq = seq;

    const local = cache.latestAnswers[qId];
    if (!local || seq >= local.clientSeq) {
      cache.latestAnswers[qId] = {
        selected: ans.selected,
        marked: Boolean(ans.marked),
        savedAt: ans.savedAt ?? ans.saved_at ?? new Date().toISOString(),
        clientSeq: seq,
      };
    }
  }

  // Merge receipts deduplicated by clientSeq
  const receiptMap = new Map<number, SignedReceipt>();
  for (const r of cache.receipts) receiptMap.set(r.clientSeq, r);
  for (const r of payload.receipts ?? []) {
    receiptMap.set(r.clientSeq, r);
    if (r.clientSeq > maxSeq) maxSeq = r.clientSeq;
  }

  cache.receipts = Array.from(receiptMap.values()).sort((a, b) => b.clientSeq - a.clientSeq);

  // Drop any pending items whose clientSeq already has a server receipt
  cache.pendingAnswers = cache.pendingAnswers.filter((p) => !receiptMap.has(p.clientSeq));

  for (const p of cache.pendingAnswers) {
    if (p.clientSeq > maxSeq) maxSeq = p.clientSeq;
  }

  cache.nextClientSeq = Math.max(cache.nextClientSeq, maxSeq + 1);
  if (payload.sessionToken) {
    cache.sessionToken = payload.sessionToken;
  }
  cache.snapshot = {
    attempt: payload.attempt,
    questions: payload.questions,
  };

  await saveAttemptCache(cache);
  return cache;
}

/**
 * IndexedDB-first write: persists the answer immediately with a strictly
 * monotonic clientSeq BEFORE any network request is attempted.
 */
export async function enqueueAnswer(
  attemptId: string,
  input: { questionId: string; selected: string[] | string; marked: boolean }
): Promise<{ cache: AttemptOfflineCache; item: QueuedAnswer }> {
  const cache = await loadAttemptCache(attemptId);
  const seq = cache.nextClientSeq;
  const savedAt = new Date().toISOString();

  const item: QueuedAnswer = {
    questionId: input.questionId,
    selected: input.selected,
    marked: input.marked,
    clientSeq: seq,
    savedAt,
  };

  cache.nextClientSeq = seq + 1;
  cache.latestAnswers[input.questionId] = {
    selected: input.selected,
    marked: input.marked,
    savedAt,
    clientSeq: seq,
  };
  cache.pendingAnswers = [...cache.pendingAnswers, item];

  await saveAttemptCache(cache);
  return { cache, item };
}

/**
 * Removes synced answers from pending queue and appends signed receipts.
 */
export async function markAnswersSynced(
  attemptId: string,
  syncedSeqs: number[],
  newReceipts: SignedReceipt[]
): Promise<AttemptOfflineCache> {
  const cache = await loadAttemptCache(attemptId);
  const syncedSet = new Set(syncedSeqs);
  cache.pendingAnswers = cache.pendingAnswers.filter((a) => !syncedSet.has(a.clientSeq));

  const receiptMap = new Map<number, SignedReceipt>();
  for (const r of cache.receipts) receiptMap.set(r.clientSeq, r);
  for (const r of newReceipts) receiptMap.set(r.clientSeq, r);
  cache.receipts = Array.from(receiptMap.values()).sort((a, b) => b.clientSeq - a.clientSeq);

  await saveAttemptCache(cache);
  return cache;
}

export async function enqueueOfflineEvent(
  attemptId: string,
  ev: QueuedEvent
): Promise<AttemptOfflineCache> {
  const cache = await loadAttemptCache(attemptId);
  cache.pendingEvents = [...cache.pendingEvents, ev];
  await saveAttemptCache(cache);
  return cache;
}

export async function clearSyncedEvents(
  attemptId: string,
  count: number
): Promise<AttemptOfflineCache> {
  const cache = await loadAttemptCache(attemptId);
  cache.pendingEvents = cache.pendingEvents.slice(count);
  await saveAttemptCache(cache);
  return cache;
}

export async function recordOfflineStart(attemptId: string): Promise<void> {
  const cache = await loadAttemptCache(attemptId);
  if (cache.offlineSinceMs === null) {
    cache.offlineSinceMs = Date.now();
    await saveAttemptCache(cache);
  }
}

export async function consumeOfflineDurationSec(attemptId: string): Promise<number | null> {
  const cache = await loadAttemptCache(attemptId);
  if (cache.offlineSinceMs === null) return null;
  const sec = Math.max(1, Math.round((Date.now() - cache.offlineSinceMs) / 1000));
  cache.offlineSinceMs = null;
  await saveAttemptCache(cache);
  return sec;
}

export async function clearAttemptCache(attemptId: string): Promise<void> {
  memoryFallback.delete(attemptId);
  try {
    await del(keyFor(attemptId));
  } catch {
    // ignore
  }
}
