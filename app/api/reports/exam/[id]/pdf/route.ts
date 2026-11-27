import { NextRequest, NextResponse } from "next/server";
import {
  assertExamOwnership,
  handleRouteError,
  HttpError,
  requireRole,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { generateExamSummaryPdf } from "@/lib/server/pdf";
import { uuidSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const { id: examId } = await context.params;
    if (!uuidSchema.safeParse(examId).success) throw new HttpError(400, "Invalid exam ID");

    const supabase = getServiceSupabase();
    const { data: exam } = await supabase
      .from("exams")
      .select("*, users!exams_owner_id_fkey(name)")
      .eq("id", examId)
      .maybeSingle();

    if (!exam) throw new HttpError(404, "Exam not found");
    assertExamOwnership(user, exam);

    const [{ count: enrolledCount }, { data: attempts }] = await Promise.all([
      supabase
        .from("enrollments")
        .select("*", { count: "exact", head: true })
        .eq("exam_id", examId)
        .eq("status", "ENROLLED"),
      supabase
        .from("attempts")
        .select("id, status, score, max_score, balance_score, users(name)")
        .eq("exam_id", examId)
        .eq("is_sandbox", false),
    ]);

    const realAttempts = attempts ?? [];
    const attemptIds = realAttempts.map((a) => a.id);

    const { data: events } = attemptIds.length
      ? await supabase
          .from("events")
          .select("attempt_id, type")
          .in("attempt_id", attemptIds)
          .in("type", ["TAB_BLUR", "FULLSCREEN_EXIT", "PASTE"])
      : { data: [] };

    const flagsByAttempt = new Map<string, number>();
    for (const e of events ?? []) {
      flagsByAttempt.set(e.attempt_id, (flagsByAttempt.get(e.attempt_id) ?? 0) + 1);
    }

    const submitted = realAttempts.filter((a) => a.status !== "IN_PROGRESS");
    const avgScore = submitted.length
      ? submitted.reduce((s, a) => s + Number(a.score ?? 0), 0) / submitted.length
      : 0;
    const passCount = submitted.filter(
      (a) => Number(a.max_score || 1) > 0 && (Number(a.score ?? 0) / Number(a.max_score)) * 100 >= 50
    ).length;

    const balances = realAttempts
      .map((a) => Number(a.balance_score))
      .filter((n) => !Number.isNaN(n));
    const min = balances.length ? Math.min(...balances) : 0;
    const max = balances.length ? Math.max(...balances) : 0;
    const mean = balances.length ? balances.reduce((a, b) => a + b, 0) / balances.length : 0;

    const ownerRel = Array.isArray(exam.users) ? exam.users[0] : exam.users;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const pdf = await generateExamSummaryPdf({
      examTitle: exam.title,
      examinerName: (ownerRel as { name?: string } | null)?.name ?? user.name,
      totalEnrolled: enrolledCount ?? 0,
      totalSubmitted: submitted.length,
      averageScore: avgScore,
      passRatePct: submitted.length ? (passCount / submitted.length) * 100 : 0,
      fairness: { min, max, mean, spread: max - min },
      seedCommitment: exam.seed_commitment,
      checkpointHash: exam.checkpoint_hash,
      verifyUrl: `${appUrl}/verify?examId=${exam.id}`,
      candidates: realAttempts.map((a) => {
        const u = Array.isArray(a.users) ? a.users[0] : a.users;
        return {
          name: (u as { name?: string } | null)?.name ?? "Candidate",
          status: a.status,
          score: a.score !== null ? Number(a.score) : null,
          maxScore: Number(a.max_score),
          flagsCount: flagsByAttempt.get(a.id) ?? 0,
        };
      }),
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="exam-summary-${exam.id.slice(0, 8)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
