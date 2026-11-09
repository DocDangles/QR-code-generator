import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@e-suite/db";

export const dynamic = "force-dynamic";

/** Railway health check, and what the admin page's domain check calls. Reveals nothing about the client. */
export async function GET() {
  try {
    await (await getDb()).execute(sql`select 1`);
    return NextResponse.json({ ok: true, app: "e-suite-qr" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
