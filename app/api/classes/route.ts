import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk, requireRole } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import type { RegisteredClassSummary } from "@/lib/shared/types";

export const runtime = "nodejs";

/**
 * GET /api/classes
 * Lists all registered classes & sections among active candidates, with student counts and exam counts.
 * Inspired by alii13/examination-management-system Teacher Classes overview.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const supabase = getServiceSupabase();

    const [{ data: students, error: stuErr }, { data: exams, error: exErr }] = await Promise.all([
      supabase
        .from("users")
        .select("id, class_name, section")
        .eq("role", "CANDIDATE")
        .eq("active", true),
      user.role === "ADMIN"
        ? supabase.from("exams").select("id, class_name, section")
        : supabase.from("exams").select("id, class_name, section").eq("owner_id", user.id),
    ]);

    if (stuErr) throw new HttpError(500, stuErr.message);
    if (exErr) throw new HttpError(500, exErr.message);

    const classMap = new Map<
      string,
      { sections: Map<string, number>; totalStudents: number; examCount: number }
    >();

    for (const s of students ?? []) {
      const cls = (s.class_name ?? "").trim();
      if (!cls) continue;
      const sec = (s.section ?? "General").trim() || "General";
      if (!classMap.has(cls)) {
        classMap.set(cls, { sections: new Map(), totalStudents: 0, examCount: 0 });
      }
      const entry = classMap.get(cls)!;
      entry.totalStudents++;
      entry.sections.set(sec, (entry.sections.get(sec) ?? 0) + 1);
    }

    for (const ex of exams ?? []) {
      const cls = (ex.class_name ?? "").trim();
      if (!cls) continue;
      if (!classMap.has(cls)) {
        classMap.set(cls, { sections: new Map(), totalStudents: 0, examCount: 0 });
      }
      classMap.get(cls)!.examCount++;
    }

    const classes: RegisteredClassSummary[] = Array.from(classMap.entries())
      .map(([className, info]) => ({
        className,
        totalStudents: info.totalStudents,
        examCount: info.examCount,
        sections: Array.from(info.sections.entries())
          .map(([section, studentCount]) => ({ section, studentCount }))
          .sort((a, b) => a.section.localeCompare(b.section)),
      }))
      .sort((a, b) => a.className.localeCompare(b.className));

    return jsonOk({ classes });
  } catch (err) {
    return handleRouteError(err);
  }
}
