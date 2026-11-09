import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, clients } from "@e-suite/db";
import { apiUser, sameOrigin } from "@/lib/auth";
import { parseClientSettings } from "@/lib/admin";
import { clearClientCache } from "@/lib/codes";

export async function PATCH(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  if (!(await apiUser(["admin"]))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  let s;
  try { s = parseClientSettings(await req.json().catch(() => ({}))); } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  const db = await getDb();
  const [client] = await db.select().from(clients).limit(1);
  if (!client) return NextResponse.json({ error: "No client is set up. Run the seed first." }, { status: 404 });
  await db.update(clients).set(s).where(eq(clients.id, client.id));
  clearClientCache();
  return NextResponse.json({ ok: true });
}
