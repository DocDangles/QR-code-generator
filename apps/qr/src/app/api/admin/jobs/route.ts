import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@e-suite/db";
import { apiUser, sameOrigin } from "@/lib/auth";
import { runNightly } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/** "Run housekeeping now" button on the admin page: the same idempotent job the cron service calls. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  if (!(await apiUser(["admin"]))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  return NextResponse.json(await runNightly(await getDb()));
}
