import { NextRequest } from "next/server";
import {
  assertExamOwnership,
  handleRouteError,
  HttpError,
  jsonOk,
  requireAuth,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { verifyAnswerChain } from "@/lib/server/chain";
import { uuidSchema } from "@/lib/shared/schemas";

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
      .select("id, candidate_id, exams(owner_id)")
      .eq("id", attemptId)
      .maybeSingle();

    if (!attempt) throw new HttpError(404, "Attempt not found");

    const exam = (Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams) as {
      owner_id: string;
    };

    if (user.role === "CANDIDATE") {
      if (attempt.candidate_id !== user.id) throw new HttpError(403, "Forbidden");
    } else {
      assertExamOwnership(user, exam);
    }

    const { data: receipts } = await supabase
      .from("receipts")
      .select("*")
      .eq("attempt_id", attemptId)
      .order("client_seq", { ascending: true });

    const { data: answers } = await supabase
      .from("answers")
      .select("*")
      .eq("attempt_id", attemptId)
      .order("client_seq", { ascending: true });

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

    return jsonOk({ receipts: receipts ?? [], chain });
  } catch (err) {
    return handleRouteError(err);
  }
}
