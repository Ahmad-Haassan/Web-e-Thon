import { NextRequest } from "next/server";
import Papa from "papaparse";
import { z } from "zod";
import { assertExamOwnership, handleRouteError, HttpError, jsonOk, requireRole } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { logAudit } from "@/lib/server/audit";
import { bulkImportCandidatesSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

const emailValidator = z.string().email();

/**
 * Bulk import candidates via CSV/JSON with row-level validation & optional exam enrollment (Feature 4.4).
 * Creates Supabase Auth accounts (via Admin API) for unknown emails and syncs public.users.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const body = await req.json();
    const parsed = bulkImportCandidatesSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid bulk candidate import payload", parsed.error.flatten());
    }

    const supabase = getServiceSupabase();

    if (parsed.data.examId) {
      const { data: exam } = await supabase
        .from("exams")
        .select("id, owner_id")
        .eq("id", parsed.data.examId)
        .maybeSingle();
      if (!exam) throw new HttpError(404, "Target exam not found");
      assertExamOwnership(actor, exam);
    }

    let rows: { name?: string; email: string; password?: string }[] = [];
    if (parsed.data.csv) {
      const csvParsed = Papa.parse<Record<string, string>>(parsed.data.csv, {
        header: true,
        skipEmptyLines: true,
      });
      rows = csvParsed.data.map((r) => ({
        name: r.name ?? r.Name ?? undefined,
        email: (r.email ?? r.Email ?? "").trim(),
        password: r.password ?? r.Password ?? undefined,
      }));
    } else if (parsed.data.rows) {
      rows = parsed.data.rows;
    } else {
      throw new HttpError(400, "Provide csv or rows");
    }

    let created = 0;
    let enrolled = 0;
    const errors: { row: number; email: string; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 1;
      const email = rows[i].email?.trim().toLowerCase() ?? "";
      if (!emailValidator.safeParse(email).success) {
        errors.push({ row: rowNum, email, message: "Invalid email address" });
        continue;
      }

      const name = rows[i].name?.trim() || email.split("@")[0];

      // Check existing public.users row
      let { data: existingUser } = await supabase
        .from("users")
        .select("id, role")
        .eq("email", email)
        .maybeSingle();

      if (!existingUser) {
        const password = rows[i].password?.trim() || `Exam@${Math.random().toString(36).slice(-8)}1!`;
        const { data: authCreated, error: authErr } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name },
          app_metadata: { role: "CANDIDATE" },
        });

        if (authErr || !authCreated.user) {
          errors.push({
            row: rowNum,
            email,
            message: authErr?.message ?? "Failed to create candidate account",
          });
          continue;
        }

        const { data: appUser, error: uErr } = await supabase
          .from("users")
          .upsert(
            {
              supabase_user_id: authCreated.user.id,
              email,
              name,
              role: "CANDIDATE",
              active: true,
            },
            { onConflict: "supabase_user_id" }
          )
          .select("id, role")
          .single();

        if (uErr || !appUser) {
          errors.push({ row: rowNum, email, message: uErr?.message ?? "DB user upsert failed" });
          continue;
        }

        existingUser = appUser;
        created++;
      }

      if (parsed.data.examId && existingUser) {
        const { error: enrErr } = await supabase.from("enrollments").upsert(
          {
            exam_id: parsed.data.examId,
            candidate_id: existingUser.id,
            status: "ENROLLED",
          },
          { onConflict: "exam_id,candidate_id" }
        );
        if (enrErr) {
          errors.push({ row: rowNum, email, message: enrErr.message });
          continue;
        }
        enrolled++;
      }
    }

    await logAudit({
      actorId: actor.id,
      action: "BULK_IMPORT_CANDIDATES",
      entity: "users",
      entityId: parsed.data.examId ?? null,
      after: { created, enrolled, failed: errors.length },
    });

    return jsonOk({ created, enrolled, failed: errors.length, errors });
  } catch (err) {
    return handleRouteError(err);
  }
}
