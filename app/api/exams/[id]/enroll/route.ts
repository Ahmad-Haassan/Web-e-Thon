import { NextRequest } from "next/server";
import { assertExamOwnership, handleRouteError, HttpError, jsonOk, requireRole } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { logAudit } from "@/lib/server/audit";
import { enrollSchema, uuidSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) throw new HttpError(400, "Invalid exam ID");

    const supabase = getServiceSupabase();
    const { data: exam } = await supabase.from("exams").select("id, owner_id").eq("id", id).maybeSingle();
    if (!exam) throw new HttpError(404, "Exam not found");
    assertExamOwnership(user, exam);

    const { data, error } = await supabase
      .from("enrollments")
      .select("status, enrolled_at, users(id, name, email, active)")
      .eq("exam_id", id);

    if (error) throw new HttpError(500, error.message);
    return jsonOk({ enrollments: data ?? [] });
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
    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) throw new HttpError(400, "Invalid exam ID");

    const body = await req.json();
    const parsed = enrollSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Provide an array of valid candidate emails", parsed.error.flatten());
    }

    const supabase = getServiceSupabase();
    const { data: exam } = await supabase.from("exams").select("id, owner_id").eq("id", id).maybeSingle();
    if (!exam) throw new HttpError(404, "Exam not found");
    assertExamOwnership(user, exam);

    const normalized = Array.from(new Set(parsed.data.emails.map((e) => e.trim().toLowerCase())));
    const { data: foundUsers } = await supabase
      .from("users")
      .select("id, email")
      .in("email", normalized);

    const foundByEmail = new Map((foundUsers ?? []).map((u) => [u.email.toLowerCase(), u.id]));
    const notFound: string[] = [];
    const upsertRows: { exam_id: string; candidate_id: string; status: "ENROLLED" }[] = [];

    for (const email of normalized) {
      const candidateId = foundByEmail.get(email);
      if (!candidateId) {
        notFound.push(email);
      } else {
        upsertRows.push({ exam_id: id, candidate_id: candidateId, status: "ENROLLED" });
      }
    }

    if (upsertRows.length > 0) {
      const { error } = await supabase
        .from("enrollments")
        .upsert(upsertRows, { onConflict: "exam_id,candidate_id" });
      if (error) throw new HttpError(500, error.message);
    }

    await logAudit({
      actorId: user.id,
      action: "CANDIDATES_ENROLLED",
      entity: "exams",
      entityId: id,
      after: { enrolledCount: upsertRows.length, notFoundCount: notFound.length },
    });

    return jsonOk({ enrolled: upsertRows.length, notFound });
  } catch (err) {
    return handleRouteError(err);
  }
}
