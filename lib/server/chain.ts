import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ChainVerificationResult } from "@/lib/shared/types";

export const GENESIS_HASH = "0".repeat(64);

function getReceiptSecret(): string {
  return process.env.RECEIPT_SECRET || "dev-receipt-secret-change-in-prod";
}

function getCheckpointSecret(): string {
  return process.env.CHECKPOINT_SECRET || "dev-checkpoint-secret-change-in-prod";
}

/** Deterministic canonical JSON stringify (sorts object keys recursively). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") +
    "}"
  );
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// --- Answer Hash Chain & Signed Receipts ---

export interface AnswerChainPayload {
  attemptId: string;
  questionId: string;
  selected: unknown;
  marked: boolean;
  clientSeq: number;
  receivedAt: string; // ISO string
  accepted: boolean;
}

export function hashAnswerRecord(prevHash: string, r: AnswerChainPayload): string {
  const canonical = [
    prevHash,
    r.attemptId,
    r.questionId,
    canonicalJson(r.selected),
    r.marked ? "1" : "0",
    String(r.clientSeq),
    new Date(r.receivedAt).toISOString(),
    r.accepted ? "1" : "0",
  ].join("|");
  return sha256Hex(canonical);
}

export function signReceipt(answerHash: string, clientSeq: number, serverTimeIso: string): string {
  const payload = `${answerHash}|${clientSeq}|${new Date(serverTimeIso).toISOString()}`;
  return createHmac("sha256", getReceiptSecret()).update(payload).digest("hex");
}

export function verifyAnswerChain(
  rows: (AnswerChainPayload & { prevHash: string; hash: string; receiptSig: string })[]
): ChainVerificationResult {
  let prev = GENESIS_HASH;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const expectedHash = hashAnswerRecord(prev, r);
    const expectedSig = signReceipt(expectedHash, r.clientSeq, r.receivedAt);
    if (r.prevHash !== prev || r.hash !== expectedHash || r.receiptSig !== expectedSig) {
      return { records: rows.length, valid: false, brokenAt: i, headHash: prev === GENESIS_HASH ? null : prev };
    }
    prev = r.hash;
  }
  return {
    records: rows.length,
    valid: true,
    brokenAt: -1,
    headHash: rows.length > 0 ? prev : null,
  };
}

// --- Event & LockEvent Hash Chains ---

export interface EventChainPayload {
  attemptId: string;
  seq: number;
  type: string;
  meta: Record<string, unknown>;
  at: string;
  actorId?: string | null;
}

export function hashEventRecord(prevHash: string, e: EventChainPayload): string {
  const canonical = [
    prevHash,
    e.attemptId,
    String(e.seq),
    e.type,
    e.actorId ?? "",
    canonicalJson(e.meta ?? {}),
    new Date(e.at).toISOString(),
  ].join("|");
  return sha256Hex(canonical);
}

export function verifyEventChain(
  rows: (EventChainPayload & { prevHash: string; hash: string })[]
): ChainVerificationResult {
  let prev = GENESIS_HASH;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const expected = hashEventRecord(prev, r);
    if (r.prevHash !== prev || r.hash !== expected) {
      return { records: rows.length, valid: false, brokenAt: i, headHash: prev === GENESIS_HASH ? null : prev };
    }
    prev = r.hash;
  }
  return {
    records: rows.length,
    valid: true,
    brokenAt: -1,
    headHash: rows.length > 0 ? prev : null,
  };
}

// --- Seed Commitment & Exam Checkpoints ---

export function generateSeedPair(): { seedSecret: string; seedCommitment: string } {
  const seedSecret = randomBytes(16).toString("hex");
  const seedCommitment = sha256Hex(seedSecret);
  return { seedSecret, seedCommitment };
}

export function verifySeedCommitment(seedReveal: string, seedCommitment: string): boolean {
  return sha256Hex(seedReveal) === seedCommitment;
}

export function computeExamCheckpoint(examId: string, attemptHeadHashes: string[]): {
  checkpointHash: string;
  checkpointSig: string;
} {
  const sorted = [...attemptHeadHashes].sort();
  const checkpointHash = sha256Hex(`${examId}|${sorted.join(",")}`);
  const checkpointSig = createHmac("sha256", getCheckpointSecret())
    .update(checkpointHash)
    .digest("hex");
  return { checkpointHash, checkpointSig };
}

export function verifyCheckpointSignature(checkpointHash: string, checkpointSig: string): boolean {
  const expected = createHmac("sha256", getCheckpointSecret())
    .update(checkpointHash)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(checkpointSig, "hex"));
  } catch {
    return false;
  }
}

// --- Unlock Codes & Public Verification Helpers ---

export function generateOneTimeUnlockCode(): { plainCode: string; codeHash: string } {
  // 8-char uppercase unambiguous alphanumeric code e.g. "K7M4-P9Q2"
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(8);
  let raw = "";
  for (let i = 0; i < 8; i++) {
    raw += alphabet[bytes[i] % alphabet.length];
  }
  const plainCode = `${raw.slice(0, 4)}-${raw.slice(4)}`;
  return { plainCode, codeHash: hashUnlockCode(plainCode) };
}

export function hashUnlockCode(code: string): string {
  const normalized = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return createHmac("sha256", getReceiptSecret()).update(`unlock:${normalized}`).digest("hex");
}

export function generateVerifyCode(): string {
  return "VER-" + randomBytes(5).toString("hex").toUpperCase();
}

export function maskCandidateName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (part.length <= 1) return "*";
      if (part.length === 2) return part[0] + "*";
      return part[0] + "*".repeat(Math.min(part.length - 2, 4)) + part[part.length - 1];
    })
    .join(" ");
}

export function computeScoreBand(score: number | null, maxScore: number): string {
  if (score === null || maxScore <= 0) return "Pending";
  const pct = (score / maxScore) * 100;
  if (pct >= 85) return "Distinction (85%+)";
  if (pct >= 70) return "Merit (70%–84%)";
  if (pct >= 50) return "Pass (50%–69%)";
  return "Below Pass (<50%)";
}
