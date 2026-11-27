import { NextRequest, NextResponse } from "next/server";
import {
  assertExamOwnership,
  handleRouteError,
  HttpError,
  requireAuth,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { computeScoreBand, verifyAnswerChain } from "@/lib/server/chain";
import { generateCandidateResultPdf } from "@/lib/server/pdf";
import { uuidSchema } from "@/lib/shared/schemas";
import type { ServerPaperSnapshot } from "@/lib/shared/types";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(req);
    const { id: attemptId } = await context.params;
    if (!uuidSchema.safeParse(attemptId).success) throw new HttpError(400, "Invalid attempt ID");

    const supabase = getServiceSupabase();
    const { data: attempt } = await supabase
      .from("attempts")
      .select("*, exams(id, owner_id, title, results_published), users(id, name, email)")
      .eq("id", attemptId)
      .maybeSingle();

    if (!attempt) throw new HttpError(404, "Attempt not found");

    const exam = (Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams) as {
      id: string;
      owner_id: string;
      title: string;
      results_published: boolean;
    };
    const candidate = (Array.isArray(attempt.users) ? attempt.users[0] : attempt.users) as {
      name: string;
      email: string;
    };

    if (user.role === "CANDIDATE") {
      if (attempt.candidate_id !== user.id) throw new HttpError(403, "Forbidden");
      if (!attempt.is_sandbox && !exam.results_published) {
        throw new HttpError(403, "Results are not published yet");
      }
    } else {
      assertExamOwnership(user, exam);
    }

    const [{ data: grades }, { data: answers }, { count: receiptCount }] = await Promise.all([
      supabase.from("attempt_grades").select("*").eq("attempt_id", attemptId),
      supabase
        .from("answers")
        .select("*")
        .eq("attempt_id", attemptId)
        .order("client_seq", { ascending: true }),
      supabase
        .from("receipts")
        .select("*", { count: "exact", head: true })
        .eq("attempt_id", attemptId),
    ]);

    const chain = verifyAnswerChain(
      (answers ?? []).map((a) => ({
        attemptId: a.attempt_id,
        questionId: a.question_id,
        selected: a.selected,
        marked: a.marked,
        clientSeq: a.client_seq,
        receivedAt: a.received_at,
        accepted: a.accepted,
        prevHash: a.prev_hash,
        hash: a.hash,
        receiptSig: a.receipt_sig,
      }))
    );

    const gradeByQ = new Map((grades ?? []).map((g) => [g.question_id, g]));
    const snapshot = attempt.paper_snapshot as ServerPaperSnapshot;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const verifyUrl = `${appUrl}/verify/${attempt.verify_code}`;
    const score = attempt.score !== null ? Number(attempt.score) : null;
    const maxScore = Number(attempt.max_score);

    const pdf = await generateCandidateResultPdf({
      examTitle: exam.title,
      candidateName: candidate?.name ?? "Candidate",
      candidateEmail: candidate?.email ?? "",
      score,
      maxScore,
      scoreBand: computeScoreBand(score, maxScore),
      submittedAt: attempt.submitted_at,
      verifyCode: attempt.verify_code,
      verifyUrl,
      chainValid: chain.valid,
      receiptCount: receiptCount ?? 0,
      breakdown: (snapshot.questions ?? []).map((q) => {
        const g = gradeByQ.get(q.id);
        return {
          questionText: q.text,
          awarded: g?.awarded !== null && g?.awarded !== undefined ? Number(g.awarded) : null,
          maxMarks: Number(q.marks),
          feedback: g?.feedback ?? null,
        };
      }),
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="result-${attempt.verify_code}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
