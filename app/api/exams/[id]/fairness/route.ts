import { NextRequest } from "next/server";
import { assertExamOwnership, handleRouteError, HttpError, jsonOk, requireRole } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { uuidSchema } from "@/lib/shared/schemas";
import type { BlueprintRule, ServerPaperSnapshot } from "@/lib/shared/types";

export const runtime = "nodejs";

/** A spread (max - min balance score) at or below this is treated as "equal difficulty". */
const FAIR_SPREAD_LIMIT = 0.25;
/** Papers should differ by at least this share (1 - average overlap) to count as "varied". */
const MIN_VARIATION_PCT = 20;
/** Cap pairwise comparison cost (n*(n-1)/2). */
const MAX_PAPERS_FOR_OVERLAP = 200;

function paperMatchesBlueprint(snapshot: ServerPaperSnapshot, blueprint: BlueprintRule[]): boolean {
  const questions = snapshot.questions ?? [];
  const quotaTotal = blueprint.reduce((s, r) => s + Number(r.count ?? 0), 0);
  if (questions.length !== quotaTotal) return false;

  // Greedy assignment mirrors the generator: each question satisfies at most one rule.
  const used = new Set<string>();
  for (const rule of blueprint) {
    let need = Number(rule.count ?? 0);
    for (const q of questions) {
      if (need <= 0) break;
      if (used.has(q.id)) continue;
      if (q.difficulty === rule.difficulty && (!rule.categoryId || q.categoryId === rule.categoryId)) {
        used.add(q.id);
        need--;
      }
    }
    if (need > 0) return false;
  }
  return true;
}

/**
 * Fairness report (Challenge 5.2 - Fairness of Randomized Examinations).
 * Reports BOTH halves of the requirement:
 *  1. Fairness  -> balance-score spread + % of papers that exactly match the blueprint mix.
 *  2. Variation -> how different the papers are from each other (1 - average Jaccard overlap).
 * Also exposes the seed commitment / reveal so the draw can be audited.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) throw new HttpError(400, "Invalid exam ID");

    const supabase = getServiceSupabase();
    const { data: exam } = await supabase
      .from("exams")
      .select("id, owner_id, title, blueprint, seed_commitment, seed_reveal")
      .eq("id", id)
      .maybeSingle();

    if (!exam) throw new HttpError(404, "Exam not found");
    assertExamOwnership(user, exam);

    const [{ data: attempts }, { count: poolCount }] = await Promise.all([
      supabase
        .from("attempts")
        .select("id, candidate_id, balance_score, started_at, paper_snapshot")
        .eq("exam_id", id)
        .eq("is_sandbox", false),
      supabase.from("exam_questions").select("*", { count: "exact", head: true }).eq("exam_id", id),
    ]);

    const rows = attempts ?? [];
    const scores = rows.map((a) => Number(a.balance_score)).filter((n) => !Number.isNaN(n));

    const min = scores.length ? Math.min(...scores) : 0;
    const max = scores.length ? Math.max(...scores) : 0;
    const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const spread = max - min;

    const blueprint = (Array.isArray(exam.blueprint) ? exam.blueprint : []) as BlueprintRule[];
    const hasBlueprint = blueprint.length > 0;

    // 1. Blueprint compliance (are all papers the same difficulty mix?)
    const snapshots = rows
      .map((a) => a.paper_snapshot as ServerPaperSnapshot | null)
      .filter((s): s is ServerPaperSnapshot => Boolean(s?.questions));

    let blueprintCompliancePct: number | null = null;
    if (hasBlueprint && snapshots.length > 0) {
      const ok = snapshots.filter((s) => paperMatchesBlueprint(s, blueprint)).length;
      blueprintCompliancePct = Number(((ok / snapshots.length) * 100).toFixed(1));
    }

    // 2. Variation between papers (average pairwise Jaccard overlap of question sets)
    const idSets = snapshots
      .slice(0, MAX_PAPERS_FOR_OVERLAP)
      .map((s) => new Set(s.questions.map((q) => q.id)));

    let avgOverlapPct: number | null = null;
    let variationPct: number | null = null;
    if (idSets.length >= 2) {
      let sum = 0;
      let pairs = 0;
      for (let i = 0; i < idSets.length; i++) {
        for (let j = i + 1; j < idSets.length; j++) {
          let inter = 0;
          for (const qid of idSets[i]) if (idSets[j].has(qid)) inter++;
          const union = idSets[i].size + idSets[j].size - inter;
          sum += union > 0 ? inter / union : 1;
          pairs++;
        }
      }
      const avgOverlap = pairs > 0 ? sum / pairs : 1;
      avgOverlapPct = Number((avgOverlap * 100).toFixed(1));
      variationPct = Number(((1 - avgOverlap) * 100).toFixed(1));
    }

    const uniquePapers = new Set(
      snapshots.map((s) =>
        s.questions
          .map((q) => q.id)
          .sort()
          .join("|")
      )
    ).size;

    // Verdict
    let verdict: "NO_DATA" | "FAIR_AND_VARIED" | "FAIR_LOW_VARIATION" | "UNEQUAL_DIFFICULTY" =
      "NO_DATA";
    if (scores.length > 0) {
      const equalDifficulty =
        spread <= FAIR_SPREAD_LIMIT &&
        (blueprintCompliancePct === null || blueprintCompliancePct === 100);
      if (!equalDifficulty) verdict = "UNEQUAL_DIFFICULTY";
      else if (variationPct !== null && variationPct < MIN_VARIATION_PCT)
        verdict = "FAIR_LOW_VARIATION";
      else verdict = "FAIR_AND_VARIED";
    }

    return jsonOk({
      examId: exam.id,
      examTitle: exam.title,
      blueprint: exam.blueprint,
      hasBlueprint,
      poolSize: poolCount ?? 0,
      attemptsCount: scores.length,
      min: Number(min.toFixed(4)),
      max: Number(max.toFixed(4)),
      mean: Number(mean.toFixed(4)),
      spread: Number(spread.toFixed(4)),
      blueprintCompliancePct,
      uniquePapers,
      avgOverlapPct,
      variationPct,
      verdict,
      seedCommitment: exam.seed_commitment,
      seedReveal: exam.seed_reveal,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
