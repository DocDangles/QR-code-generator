import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@e-suite/db";
import { runNightly } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/**
 * Called by a Railway cron service, e.g.
 *   curl -fsS -X POST -H "Authorization: Bearer $JOB_SECRET" https://<app>/api/jobs/nightly
 * Idempotent, so running it hourly is fine. Disabled until JOB_SECRET is set.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.JOB_SECRET;
  if (!secret) return NextResponse.json({ error: "Jobs are disabled: set JOB_SECRET" }, { status: 503 });
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const a = Buffer.from(given), b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runNightly(await getDb()));
}
