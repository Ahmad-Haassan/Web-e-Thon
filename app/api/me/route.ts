import { NextRequest } from "next/server";
import { handleRouteError, jsonOk, requireAuth } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    return jsonOk({ user });
  } catch (err) {
    return handleRouteError(err);
  }
}
