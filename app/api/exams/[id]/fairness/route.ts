import { NextRequest } from "next/server";
import { assertExamOwnership, handleRouteError, HttpError, jsonOk, requireRole } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { uuidSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

/**
 * Fairness report (Innovation 5.2): min, max, mean and spread of paper balance scores
 * across all non-sandbox attempts, plus seed commitment / reveal audit state.
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

    const { data: attempts } = await supabase
      .from("attempts")
      .select("id, candidate_id, balance_score, started_at")
      .eq("exam_id", id)
      .eq("is_sandbox", false);

    const scores = (attempts ?? [])
      .map((a) => Number(a.balance_score))
      .filter((n) => !Number.isNaN(n));

    const min = scores.length ? Math.min(...scores) : 0;
    const max = scores.length ? Math.max(...scores) : 0;
    const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const spread = max - min;

    return jsonOk({
      examId: exam.id,
      examTitle: exam.title,
      blueprint: exam.blueprint,
      attemptsCount: scores.length,
      min: Number(min.toFixed(4)),
      max: Number(max.toFixed(4)),
      mean: Number(mean.toFixed(4)),
      spread: Number(spread.toFixed(4)),
      seedCommitment: exam.seed_commitment,
      seedReveal: exam.seed_reveal,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
