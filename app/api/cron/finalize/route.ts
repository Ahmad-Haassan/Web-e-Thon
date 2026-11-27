import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk, requireRole } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { lazyFinalizeExpiredAttempts } from "@/lib/server/grading";

export const runtime = "nodejs";

/**
 * Scheduled/manual expiry finalizer endpoint (Section 5.5).
 * Can be called by Vercel Cron with header `x-cron-secret`, or by an ADMIN user.
 */
export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const provided = req.headers.get("x-cron-secret");

    if (!(cronSecret && provided && provided === cronSecret)) {
      await requireRole(req, ["ADMIN"]);
    }

    const supabase = getServiceSupabase();
    const finalizedCount = await lazyFinalizeExpiredAttempts(supabase);
    return jsonOk({ finalizedCount, at: new Date().toISOString() });
  } catch (err) {
    if (err instanceof HttpError) return handleRouteError(err);
    return handleRouteError(err);
  }
}
