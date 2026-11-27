import seedrandom from "seedrandom";
import type {
  BlueprintRule,
  ClientSnapshotQuestion,
  ServerPaperSnapshot,
  ServerSnapshotQuestion,
} from "@/lib/shared/types";

export interface PoolQuestion {
  id: string;
  categoryId: string | null;
  type: "SINGLE" | "MULTI" | "WRITTEN";
  difficulty: 1 | 2 | 3;
  text: string;
  marks: number;
  negativeMarking: number;
  explanation?: string | null;
  historicalDifficultyIndex?: number | null;
  options: { id: string; text: string }[];
  correctOptionIds: string[];
  writtenRubric?: string | null;
}

function deterministicShuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Computes a paper's difficulty balance score combining stated difficulty (1-3)
 * and historical empirical difficulty index (0..1, where higher = harder, default 0.5).
 */
export function computeBalanceScore(questions: Pick<PoolQuestion, "difficulty" | "historicalDifficultyIndex">[]): number {
  if (questions.length === 0) return 0;
  const total = questions.reduce((sum, q) => {
    const emp = q.historicalDifficultyIndex ?? 0.5;
    // Blend nominal difficulty (1..3) with empirical hardness (0..1 -> +0..1)
    return sum + q.difficulty + emp;
  }, 0);
  return Number((total / questions.length).toFixed(4));
}

/**
 * Expected balance score of ANY paper drawn from this blueprint (Challenge 5.2).
 * For every quota rule we take the mean blended difficulty of the pool questions that
 * the rule can pick from, then weight it by the rule's question count. A drawn paper
 * whose balance score is close to this target has the "fair" difficulty profile.
 */
export function computeBlueprintTargetMean(
  pool: PoolQuestion[],
  blueprint: BlueprintRule[]
): number | null {
  let weighted = 0;
  let total = 0;
  for (const rule of blueprint) {
    const matching = pool.filter(
      (q) =>
        q.difficulty === rule.difficulty && (!rule.categoryId || q.categoryId === rule.categoryId)
    );
    if (matching.length === 0 || rule.count <= 0) continue;
    weighted += computeBalanceScore(matching) * Math.min(rule.count, matching.length);
    total += Math.min(rule.count, matching.length);
  }
  return total > 0 ? Number((weighted / total).toFixed(4)) : null;
}

/**
 * Checks that the question pool can satisfy every blueprint quota. If a quota cannot be met
 * the drawn papers would silently be shorter / easier / harder than others, which is exactly
 * the unfairness Challenge 5.2 asks us to prevent. Returns human-readable shortages.
 */
export function findBlueprintShortages(
  pool: Pick<PoolQuestion, "difficulty" | "categoryId">[],
  blueprint: BlueprintRule[]
): string[] {
  const labels: Record<number, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };
  const shortages: string[] = [];
  const consumed = new Set<number>();
  for (const rule of blueprint) {
    if (rule.count <= 0) continue;
    let available = 0;
    pool.forEach((q, idx) => {
      if (
        !consumed.has(idx) &&
        q.difficulty === rule.difficulty &&
        (!rule.categoryId || q.categoryId === rule.categoryId)
      ) {
        available++;
      }
    });
    if (available < rule.count) {
      shortages.push(
        `${labels[rule.difficulty] ?? `Level ${rule.difficulty}`}${
          rule.categoryId ? " (selected category)" : ""
        }: needs ${rule.count}, only ${available} attached`
      );
    }
    // reserve questions this rule would use so later rules cannot double-count them
    let reserve = rule.count;
    pool.forEach((q, idx) => {
      if (
        reserve > 0 &&
        !consumed.has(idx) &&
        q.difficulty === rule.difficulty &&
        (!rule.categoryId || q.categoryId === rule.categoryId)
      ) {
        consumed.add(idx);
        reserve--;
      }
    });
  }
  return shortages;
}

function drawFromBlueprint(
  pool: PoolQuestion[],
  blueprint: BlueprintRule[],
  rng: () => number
): PoolQuestion[] {
  const chosenIds = new Set<string>();
  const picked: PoolQuestion[] = [];

  for (const rule of blueprint) {
    const matching = pool.filter(
      (q) =>
        !chosenIds.has(q.id) &&
        q.difficulty === rule.difficulty &&
        (!rule.categoryId || q.categoryId === rule.categoryId)
    );
    const shuffled = deterministicShuffle(matching, rng);
    const take = shuffled.slice(0, rule.count);
    for (const q of take) {
      chosenIds.add(q.id);
      picked.push(q);
    }
  }

  return picked;
}

/**
 * Generates a deterministic, fairness-balanced paper snapshot for a candidate.
 * Given the exam's revealed seedSecret and candidateId, anyone can regenerate
 * the exact same paper to audit fairness!
 */
export function generateFairPaperSnapshot(params: {
  examId: string;
  candidateId: string;
  seedSecret: string;
  pool: PoolQuestion[];
  blueprint?: BlueprintRule[] | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  targetBalanceMean?: number | null;
  balanceTolerance?: number;
}): ServerPaperSnapshot {
  const {
    examId,
    candidateId,
    seedSecret,
    pool,
    blueprint,
    shuffleQuestions,
    shuffleOptions,
    targetBalanceMean,
    balanceTolerance = 0.2,
  } = params;

  const baseSeed = `${seedSecret}:${examId}:${candidateId}`;
  const hasBlueprint = Array.isArray(blueprint) && blueprint.length > 0;

  // Target mean: for blueprint exams it is the expected balance of a blueprint draw
  // (not the whole-pool mean, which would be skewed by unused questions).
  const blueprintTarget = hasBlueprint
    ? computeBlueprintTargetMean(pool, blueprint as BlueprintRule[])
    : null;
  const expectedMean =
    targetBalanceMean ??
    blueprintTarget ??
    (pool.length > 0 ? computeBalanceScore(pool) : 2.0);

  let bestPicked: PoolQuestion[] = [];
  let bestScore = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  let winningSeed = baseSeed;

  const maxAttempts = hasBlueprint ? 25 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const trySeed = attempt === 0 ? baseSeed : `${baseSeed}:redraw:${attempt}`;
    const rng = seedrandom(trySeed);

    const candidateQuestions = hasBlueprint
      ? drawFromBlueprint(pool, blueprint, rng)
      : [...pool];

    const score = computeBalanceScore(candidateQuestions);
    const delta = Math.abs(score - expectedMean);

    if (delta < bestDelta) {
      bestDelta = delta;
      bestPicked = candidateQuestions;
      bestScore = score;
      winningSeed = trySeed;
    }

    if (delta <= balanceTolerance) {
      break;
    }
  }

  // Fallback if blueprint yielded fewer questions than pool when pool is tiny
  if (bestPicked.length === 0 && pool.length > 0) {
    bestPicked = [...pool];
    bestScore = computeBalanceScore(bestPicked);
  }

  const orderRng = seedrandom(`${winningSeed}:order`);
  const orderedQuestions = shuffleQuestions
    ? deterministicShuffle(bestPicked, orderRng)
    : bestPicked;

  const snapshotQuestions: ServerSnapshotQuestion[] = orderedQuestions.map((q) => {
    const optRng = seedrandom(`${winningSeed}:opt:${q.id}`);
    const opts = shuffleOptions
      ? deterministicShuffle(q.options, optRng)
      : [...q.options];

    return {
      id: q.id,
      type: q.type,
      difficulty: q.difficulty,
      text: q.text,
      marks: q.marks,
      negativeMarking: q.negativeMarking,
      categoryId: q.categoryId,
      options: opts.map((o) => ({ id: o.id, text: o.text })),
      correctOptionIds: [...q.correctOptionIds],
      writtenRubric: q.writtenRubric ?? null,
      explanation: q.explanation ?? null,
      historicalDifficultyIndex: q.historicalDifficultyIndex ?? null,
    };
  });

  const totalMarks = Number(
    snapshotQuestions.reduce((acc, q) => acc + Number(q.marks), 0).toFixed(2)
  );

  return {
    version: 1,
    examId,
    candidateId,
    seedUsed: winningSeed,
    generatedAt: new Date().toISOString(),
    questions: snapshotQuestions,
    balanceScore: bestScore,
    totalMarks,
  };
}

/**
 * Strips ALL answer keys, rubrics, and explanations before sending a paper to a candidate.
 * Security rule (Section 8): answer keys NEVER reach the client during an attempt.
 */
export function stripPaperSnapshot(snapshot: ServerPaperSnapshot): ClientSnapshotQuestion[] {
  return (snapshot.questions ?? []).map((q) => ({
    id: q.id,
    type: q.type,
    difficulty: q.difficulty,
    text: q.text,
    marks: q.marks,
    negativeMarking: q.negativeMarking,
    options: q.options,
    categoryId: q.categoryId ?? null,
  }));
}
