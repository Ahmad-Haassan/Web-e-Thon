import { NextRequest } from "next/server";
import {
  assertExamOwnership,
  handleRouteError,
  HttpError,
  jsonOk,
  requireAuth,
  requireRole,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { createAnnouncementSchema, uuidSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(req);
    const { id: examId } = await context.params;
    if (!uuidSchema.safeParse(examId).success) throw new HttpError(400, "Invalid exam ID");

    const supabase = getServiceSupabase();
    const { data: exam } = await supabase
      .from("exams")
      .select("id, owner_id")
      .eq("id", examId)
      .maybeSingle();

    if (!exam) throw new HttpError(404, "Exam not found");

    if (user.role === "CANDIDATE") {
      const { data: enr } = await supabase
        .from("enrollments")
        .select("status")
        .eq("exam_id", examId)
        .eq("candidate_id", user.id)
        .maybeSingle();
      if (!enr || enr.status !== "ENROLLED") throw new HttpError(403, "Forbidden");
    } else {
      assertExamOwnership(user, exam);
    }

    const { data, error } = await supabase
      .from("announcements")
      .select("id, exam_id, message, at, users(name)")
      .eq("exam_id", examId)
      .order("at", { ascending: false });

    if (error) throw new HttpError(500, error.message);
    return jsonOk({ announcements: data ?? [] });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const { id: examId } = await context.params;
    if (!uuidSchema.safeParse(examId).success) throw new HttpError(400, "Invalid exam ID");

    const body = await req.json();
    const parsed = createAnnouncementSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid announcement message", parsed.error.flatten());
    }

    const supabase = getServiceSupabase();
    const { data: exam } = await supabase
      .from("exams")
      .select("id, owner_id")
      .eq("id", examId)
      .maybeSingle();

    if (!exam) throw new HttpError(404, "Exam not found");
    assertExamOwnership(user, exam);

    const { data, error } = await supabase
      .from("announcements")
      .insert({
        exam_id: examId,
        author_id: user.id,
        message: parsed.data.message,
      })
      .select("*")
      .single();

    if (error) throw new HttpError(500, error.message);
    return jsonOk({ announcement: data }, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
