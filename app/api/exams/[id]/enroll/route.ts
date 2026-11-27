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
      .select("candidate_id, status, enrolled_at, users(id, name, email, active, class_name, section, phone)")
      .eq("exam_id", id);

    if (error) throw new HttpError(500, error.message);
    const normalized = (data ?? []).map((row) => {
      const u = (Array.isArray(row.users) ? row.users[0] : row.users) as {
        id: string;
        name: string;
        email: string;
        active: boolean;
        class_name?: string | null;
        section?: string | null;
        phone?: string | null;
      } | null;
      return {
        exam_id: id,
        candidate_id: row.candidate_id ?? u?.id,
        status: row.status,
        enrolled_at: row.enrolled_at,
        user: u ?? undefined,
        candidate: u ?? undefined,
        users: u ?? undefined,
        name: u?.name,
        email: u?.email,
      };
    });

    return jsonOk({ enrollments: normalized });
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
      throw new HttpError(400, "Provide valid candidate emails or a className", parsed.error.flatten());
    }

    const supabase = getServiceSupabase();
    const { data: exam } = await supabase.from("exams").select("id, owner_id").eq("id", id).maybeSingle();
    if (!exam) throw new HttpError(404, "Exam not found");
    assertExamOwnership(user, exam);

    const notFound: string[] = [];
    const candidateIds = new Set<string>();

    // 1. Enroll by email list
    if (parsed.data.emails && parsed.data.emails.length > 0) {
      const normalized = Array.from(new Set(parsed.data.emails.map((e) => e.trim().toLowerCase())));
      const { data: foundUsers } = await supabase
        .from("users")
        .select("id, email")
        .in("email", normalized);

      const foundByEmail = new Map((foundUsers ?? []).map((u) => [u.email.toLowerCase(), u.id]));
      for (const email of normalized) {
        const candidateId = foundByEmail.get(email);
        if (!candidateId) {
          notFound.push(email);
        } else {
          candidateIds.add(candidateId);
        }
      }
    }

    // 2. Enroll entire Class (& optional Section)
    if (parsed.data.className && parsed.data.className.trim()) {
      let clsQuery = supabase
        .from("users")
        .select("id")
        .eq("role", "CANDIDATE")
        .eq("active", true)
        .ilike("class_name", parsed.data.className.trim());

      if (parsed.data.section && parsed.data.section.trim()) {
        clsQuery = clsQuery.ilike("section", parsed.data.section.trim());
      }

      const { data: classUsers, error: clsErr } = await clsQuery;
      if (clsErr) throw new HttpError(500, clsErr.message);

      for (const u of classUsers ?? []) {
        candidateIds.add(u.id);
      }

      // Also save class/section metadata on the exam if not already set
      await supabase
        .from("exams")
        .update({
          class_name: parsed.data.className.trim(),
          ...(parsed.data.section?.trim() ? { section: parsed.data.section.trim() } : {}),
        })
        .eq("id", id);
    }

    const upsertRows = Array.from(candidateIds).map((candidateId) => ({
      exam_id: id,
      candidate_id: candidateId,
      status: "ENROLLED" as const,
    }));

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
      after: {
        enrolledCount: upsertRows.length,
        notFoundCount: notFound.length,
        className: parsed.data.className ?? null,
        section: parsed.data.section ?? null,
      },
    });

    return jsonOk({ enrolled: upsertRows.length, notFound });
  } catch (err) {
    return handleRouteError(err);
  }
}
