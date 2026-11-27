import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, requireRole } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { logAudit } from "@/lib/server/audit";

export const runtime = "nodejs";

/**
 * Admin Data Export & Backup (JSON or CSV).
 * Strips secret columns (question_keys, seed_secret, unlock code hashes).
 */
export async function GET(req: NextRequest) {
  try {
    const admin = await requireRole(req, ["ADMIN"]);
    const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";
    const supabase = getServiceSupabase();

    const [{ data: users }, { data: exams }, { data: attempts }, { data: disputes }, { data: auditLogs }] =
      await Promise.all([
        supabase.from("users").select("id, name, email, role, active, created_at"),
        supabase
          .from("exams")
          .select("id, title, status, start_at, end_at, duration_min, total_marks, results_published, seed_commitment, checkpoint_hash, created_at"),
        supabase
          .from("attempts")
          .select("id, exam_id, candidate_id, status, score, max_score, started_at, submitted_at, verify_code, balance_score, users(name, email), exams(title)")
          .eq("is_sandbox", false),
        supabase.from("disputes").select("id, attempt_id, type, reason, status, resolution, created_at, resolved_at"),
        supabase.from("audit_logs").select("id, actor_id, action, entity, entity_id, at").order("at", { ascending: false }).limit(500),
      ]);

    await logAudit({
      actorId: admin.id,
      action: "ADMIN_DATA_EXPORTED",
      entity: "system",
      after: { format },
    });

    const dateTag = new Date().toISOString().slice(0, 10);

    if (format === "csv") {
      const header = "Attempt ID,Exam,Candidate,Email,Status,Score,Max Score,Verify Code,Submitted At";
      const rows = (attempts ?? []).map((a) => {
        const u = (Array.isArray(a.users) ? a.users[0] : a.users) as { name?: string; email?: string } | null;
        const ex = (Array.isArray(a.exams) ? a.exams[0] : a.exams) as { title?: string } | null;
        const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        return [
          a.id,
          ex?.title ?? a.exam_id,
          u?.name ?? "",
          u?.email ?? "",
          a.status,
          a.score ?? "",
          a.max_score,
          a.verify_code,
          a.submitted_at ?? "",
        ]
          .map(esc)
          .join(",");
      });
      const csv = [header, ...rows].join("\n");
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="veriexam-results-${dateTag}.csv"`,
        },
      });
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: admin.email,
      counts: {
        users: (users ?? []).length,
        exams: (exams ?? []).length,
        attempts: (attempts ?? []).length,
        disputes: (disputes ?? []).length,
        auditLogs: (auditLogs ?? []).length,
      },
      users: users ?? [],
      exams: exams ?? [],
      attempts: attempts ?? [],
      disputes: disputes ?? [],
      auditLogs: auditLogs ?? [],
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="veriexam-backup-${dateTag}.json"`,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
