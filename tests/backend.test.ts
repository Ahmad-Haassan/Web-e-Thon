import { describe, expect, it } from "vitest";
import {
  GENESIS_HASH,
  computeExamCheckpoint,
  computeScoreBand,
  generateOneTimeUnlockCode,
  generateSeedPair,
  hashAnswerRecord,
  hashEventRecord,
  hashUnlockCode,
  maskCandidateName,
  signReceipt,
  verifyAnswerChain,
  verifyCheckpointSignature,
  verifyEventChain,
  verifySeedCommitment,
} from "@/lib/server/chain";
import {
  generateFairPaperSnapshot,
  stripPaperSnapshot,
  type PoolQuestion,
} from "@/lib/server/randomizer";
import { gradeMultiQuestion, gradeSingleQuestion } from "@/lib/server/grading";
import { createExamSchema, enrollSchema, updateProfileSchema } from "@/lib/shared/schemas";

describe("Cryptographic Hash Chain & Receipts", () => {
  it("verifies an intact answer chain and detects any DB tampering", () => {
    const t1 = "2026-11-27T10:00:00.000Z";
    const t2 = "2026-11-27T10:01:00.000Z";

    const r1Base = {
      attemptId: "att-1",
      questionId: "q-1",
      selected: ["opt-b"],
      marked: false,
      clientSeq: 1,
      receivedAt: t1,
      accepted: true,
    };
    const h1 = hashAnswerRecord(GENESIS_HASH, r1Base);
    const sig1 = signReceipt(h1, 1, t1);

    const r2Base = {
      attemptId: "att-1",
      questionId: "q-2",
      selected: ["opt-a", "opt-c"],
      marked: true,
      clientSeq: 2,
      receivedAt: t2,
      accepted: true,
    };
    const h2 = hashAnswerRecord(h1, r2Base);
    const sig2 = signReceipt(h2, 2, t2);

    const validChain = [
      { ...r1Base, prevHash: GENESIS_HASH, hash: h1, receiptSig: sig1 },
      { ...r2Base, prevHash: h1, hash: h2, receiptSig: sig2 },
    ];
    expect(verifyAnswerChain(validChain)).toEqual({
      records: 2,
      valid: true,
      brokenAt: -1,
      headHash: h2,
    });

    // Simulate an admin silently altering row 1's selected option in the database
    const tampered = [
      { ...validChain[0], selected: ["opt-a"] },
      validChain[1],
    ];
    const check = verifyAnswerChain(tampered);
    expect(check.valid).toBe(false);
    expect(check.brokenAt).toBe(0);
  });

  it("verifies event hash chains and seed commitments", () => {
    const at = "2026-11-27T10:05:00.000Z";
    const e1 = { attemptId: "att-1", seq: 1, type: "TAB_BLUR", meta: { ms: 2000 }, at };
    const h1 = hashEventRecord(GENESIS_HASH, e1);
    expect(verifyEventChain([{ ...e1, prevHash: GENESIS_HASH, hash: h1 }]).valid).toBe(true);
    expect(
      verifyEventChain([{ ...e1, type: "DISCONNECT", prevHash: GENESIS_HASH, hash: h1 }]).valid
    ).toBe(false);

    const { seedSecret, seedCommitment } = generateSeedPair();
    expect(verifySeedCommitment(seedSecret, seedCommitment)).toBe(true);
    expect(verifySeedCommitment("wrong-seed", seedCommitment)).toBe(false);
  });

  it("signs exam checkpoints, hashes unlock codes, and masks PII for public verify", () => {
    const cp = computeExamCheckpoint("exam-1", ["att-1:abc", "att-2:def"]);
    expect(verifyCheckpointSignature(cp.checkpointHash, cp.checkpointSig)).toBe(true);
    expect(verifyCheckpointSignature(cp.checkpointHash, "0".repeat(64))).toBe(false);

    const { plainCode, codeHash } = generateOneTimeUnlockCode();
    expect(hashUnlockCode(plainCode.toLowerCase().replace("-", ""))).toBe(codeHash);

    expect(maskCandidateName("Ali Raza")).toBe("A*i R**a");
    expect(computeScoreBand(88, 100)).toContain("Distinction");
    expect(computeScoreBand(40, 100)).toContain("Below Pass");
  });
});

describe("Fair Deterministic Randomizer & Key Stripping", () => {
  const pool: PoolQuestion[] = Array.from({ length: 12 }, (_, i) => ({
    id: `q-${i + 1}`,
    categoryId: i % 2 === 0 ? "cat-1" : "cat-2",
    type: "SINGLE",
    difficulty: ((i % 3) + 1) as 1 | 2 | 3,
    text: `Question ${i + 1}`,
    marks: 2,
    negativeMarking: 0,
    options: [
      { id: `q-${i + 1}-a`, text: "A" },
      { id: `q-${i + 1}-b`, text: "B" },
    ],
    correctOptionIds: [`q-${i + 1}-b`],
    writtenRubric: "secret rubric",
  }));

  it("generates reproducible papers per seed+candidate and enforces blueprint quotas", () => {
    const params = {
      examId: "exam-1",
      candidateId: "cand-42",
      seedSecret: "fixed-secret-seed",
      pool,
      blueprint: [
        { difficulty: 1 as const, count: 2 },
        { difficulty: 2 as const, count: 2 },
        { difficulty: 3 as const, count: 1 },
      ],
      shuffleQuestions: true,
      shuffleOptions: true,
    };

    const snap1 = generateFairPaperSnapshot(params);
    const snap2 = generateFairPaperSnapshot(params);

    expect(snap1.questions.length).toBe(5);
    expect(snap1.questions.map((q) => q.id)).toEqual(snap2.questions.map((q) => q.id));
    expect(snap1.questions.filter((q) => q.difficulty === 1)).toHaveLength(2);
    expect(snap1.questions.filter((q) => q.difficulty === 2)).toHaveLength(2);
    expect(snap1.questions.filter((q) => q.difficulty === 3)).toHaveLength(1);

    const stripped = stripPaperSnapshot(snap1);
    for (const q of stripped) {
      expect("correctOptionIds" in q).toBe(false);
      expect("writtenRubric" in q).toBe(false);
    }
  });
});

describe("Grading Engine (Single & Multi Partial Credit)", () => {
  it("grades single choice with optional negative marking", () => {
    expect(gradeSingleQuestion(["b"], ["b"], 4, 1)).toBe(4);
    expect(gradeSingleQuestion(["a"], ["b"], 4, 1)).toBe(-1);
    expect(gradeSingleQuestion([], ["b"], 4, 1)).toBe(0);
  });

  it("grades multi-select partial credit (+correct/n - wrong/n, floored at 0)", () => {
    // 2 correct options (a, b), marks = 4
    expect(gradeMultiQuestion(["a", "b"], ["a", "b"], 4)).toBe(4);
    expect(gradeMultiQuestion(["a"], ["a", "b"], 4)).toBe(2);
    expect(gradeMultiQuestion(["a", "c"], ["a", "b"], 4)).toBe(0); // +1/2 - 1/2 = 0
    expect(gradeMultiQuestion(["c", "d"], ["a", "b"], 4)).toBe(0); // floored at 0
    expect(
      gradeMultiQuestion(["a"], ["a", "b"], 4, { enabled: false, wrongPenalty: true })
    ).toBe(0);
  });
});

describe("EMS Feature Schemas (Profile, Class Enrollment, Rules & Inline Questions)", () => {
  it("validates profile updates with class, section, and phone", () => {
    const ok = updateProfileSchema.safeParse({
      name: "Ali Raza",
      phone: "+92 300 1234567",
      className: "BSCS-4",
      section: "A",
    });
    expect(ok.success).toBe(true);
    expect(updateProfileSchema.safeParse({ name: "A" }).success).toBe(false);
  });

  it("supports enrollment by emails or by class/section", () => {
    expect(enrollSchema.safeParse({ emails: ["a@uni.edu"] }).success).toBe(true);
    expect(enrollSchema.safeParse({ className: "BSCS-4", section: "A" }).success).toBe(true);
    expect(enrollSchema.safeParse({}).success).toBe(false);
  });

  it("validates exam creation with class assignment, rules, and inline MCQ questions", () => {
    const now = Date.now();
    const res = createExamSchema.safeParse({
      title: "Midterm Systems Exam",
      category: "Computer Science",
      className: "BSCS-4",
      section: "A",
      autoEnrollClass: true,
      rules: ["One attempt only", "Timer is server-authoritative"],
      startAt: new Date(now + 60_000).toISOString(),
      endAt: new Date(now + 3_600_000).toISOString(),
      durationMin: 45,
      inlineQuestions: [
        {
          type: "SINGLE",
          difficulty: 2,
          text: "Which protocol is connection-oriented?",
          marks: 2,
          options: [
            { text: "UDP", isCorrect: false },
            { text: "TCP", isCorrect: true },
            { text: "ICMP", isCorrect: false },
            { text: "ARP", isCorrect: false },
          ],
        },
      ],
    });
    expect(res.success).toBe(true);
  });
});
