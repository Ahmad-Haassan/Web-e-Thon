import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const now = Date.now();
  return NextResponse.json(
    { now, iso: new Date(now).toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
