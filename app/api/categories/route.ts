import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk, requireAuth, requireRole } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { createCategorySchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.from("categories").select("*").order("name");
    if (error) throw new HttpError(500, error.message);
    return jsonOk({ categories: data ?? [] });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["ADMIN", "EXAMINER"]);
    const body = await req.json();
    const parsed = createCategorySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid category name", parsed.error.flatten());
    }

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("categories")
      .insert({ name: parsed.data.name })
      .select("*")
      .single();

    if (error) throw new HttpError(400, error.message);
    return jsonOk({ category: data }, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
