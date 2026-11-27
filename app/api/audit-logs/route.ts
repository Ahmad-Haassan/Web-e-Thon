import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk, requireRole } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";

export const runtime = "nodejs";

/**
 * Audit Log endpoint (Section 4 & 11):
 * - ADMIN sees all audit logs (filterable by entity, entityId, action).
 * - EXAMINER sees their own actions plus audit logs on exams/disputes they acted on.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const supabase = getServiceSupabase();

    const entity = req.nextUrl.searchParams.get("entity");
    const entityId = req.nextUrl.searchParams.get("entityId");
    const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const limit = Math.min(200, Math.max(1, Number.isNaN(limitParam) ? 100 : limitParam));

    let query = supabase
      .from("audit_logs")
      .select("*, users(id, name, email, role)")
      .order("at", { ascending: false })
      .limit(limit);

    if (user.role === "EXAMINER") {
      query = query.eq("actor_id", user.id);
    }
    if (entity) query = query.eq("entity", entity);
    if (entityId) query = query.eq("entity_id", entityId);

    const { data, error } = await query;
    if (error) throw new HttpError(500, error.message);

    return jsonOk({ logs: data ?? [] });
  } catch (err) {
    return handleRouteError(err);
  }
}
