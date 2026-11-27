import { NextRequest } from "next/server";
import {
  handleRouteError,
  HttpError,
  jsonOk,
  requireAuth,
  requireRole,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { logAudit } from "@/lib/server/audit";
import { createDisputeSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const supabase = getServiceSupabase();
    const examId = req.nextUrl.searchParams.get("examId");
    const status = req.nextUrl.searchParams.get("status");

    let query = supabase
      .from("disputes")
      .select("*, attempts!inner(id, exam_id, candidate_id, exams(id, title, owner_id), users(id, name, email))")
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw new HttpError(500, error.message);

    // Filter strictly by ownership / role
    const filtered = (data ?? []).filter((d) => {
      const att = (Array.isArray(d.attempts) ? d.attempts[0] : d.attempts) as {
        exam_id: string;
        candidate_id: string;
        exams: { owner_id: string } | { owner_id: string }[];
      };
      if (examId && att.exam_id !== examId) return false;
      if (user.role === "ADMIN") return true;
      if (user.role === "CANDIDATE") return att.candidate_id === user.id;
      const ex = Array.isArray(att.exams) ? att.exams[0] : att.exams;
      return ex?.owner_id === user.id;
    });

    return jsonOk({ disputes: filtered });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const candidate = await requireRole(req, ["CANDIDATE"]);
    const body = await req.json();
    const parsed = createDisputeSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid dispute payload", parsed.error.flatten());
    }

    const supabase = getServiceSupabase();
    const { data: attempt } = await supabase
      .from("attempts")
      .select("id, candidate_id, is_sandbox, status, exams(results_published)")
      .eq("id", parsed.data.attemptId)
      .maybeSingle();

    if (!attempt) throw new HttpError(404, "Attempt not found");
    if (attempt.candidate_id !== candidate.id) {
      throw new HttpError(403, "Forbidden: cannot raise dispute on another candidate's attempt");
    }
    if (attempt.is_sandbox) {
      throw new HttpError(400, "Cannot raise disputes on sandbox attempts");
    }

    const exam = (Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams) as {
      results_published: boolean;
    };
    if (!exam.results_published && parsed.data.type !== "TECHNICAL") {
      throw new HttpError(400, "Grading/ambiguity disputes can only be raised after results are published");
    }

    const { data: dispute, error } = await supabase
      .from("disputes")
      .insert({
        attempt_id: parsed.data.attemptId,
        question_id: parsed.data.questionId ?? null,
        type: parsed.data.type,
        reason: parsed.data.reason,
        status: "OPEN",
      })
      .select("*")
      .single();

    if (error) throw new HttpError(500, error.message);

    await logAudit({
      actorId: candidate.id,
      action: "DISPUTE_CREATED",
      entity: "disputes",
      entityId: dispute.id,
      after: { type: dispute.type, attemptId: dispute.attempt_id, questionId: dispute.question_id },
    });

    return jsonOk({ dispute }, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
