import { getServiceSupabase } from "./supabase";

export async function logAudit(params: {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  try {
    const supabase = getServiceSupabase();
    await supabase.from("audit_logs").insert({
      actor_id: params.actorId,
      action: params.action,
      entity: params.entity,
      entity_id: params.entityId ?? null,
      before: params.before ?? null,
      after: params.after ?? null,
    });
  } catch (err) {
    // Audit failure should never silently lose context; log loudly
    console.error("[AUDIT LOG ERROR]", err);
  }
}
