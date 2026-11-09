import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, users } from "@e-suite/db";
import { apiUser, sameOrigin } from "@/lib/auth";

const ROLES = ["admin", "client_editor", "client_viewer"] as const;
const UUID = /^[0-9a-f-]{36}$/i;

/** Guards shared by role changes and removals: you can't lock yourself out, and the last admin can't go. */
async function guard(req: NextRequest, id: string) {
  if (!sameOrigin(req)) return { error: NextResponse.json({ error: "Bad origin" }, { status: 403 }) };
  const me = await apiUser(["admin"]);
  if (!me) return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  if (!UUID.test(id)) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const db = await getDb();
  const [target] = await db.select().from(users).where(eq(users.id, id));
  if (!target) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const admins = (await db.select().from(users).where(eq(users.role, "admin"))).length;
  return { me, db, target, admins };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(req, (await ctx.params).id);
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  const role = ROLES.find((r) => r === body?.role);
  if (!role) return NextResponse.json({ error: "Choose a role" }, { status: 400 });
  if (g.target.id === g.me.id && role !== "admin") return NextResponse.json({ error: "You can't remove your own admin access" }, { status: 400 });
  if (g.target.role === "admin" && role !== "admin" && g.admins <= 1) return NextResponse.json({ error: "There must be at least one admin" }, { status: 400 });
  await g.db.update(users).set({ role }).where(eq(users.id, g.target.id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(req, (await ctx.params).id);
  if (g.error) return g.error;
  if (g.target.id === g.me.id) return NextResponse.json({ error: "You can't remove yourself" }, { status: 400 });
  if (g.target.role === "admin" && g.admins <= 1) return NextResponse.json({ error: "There must be at least one admin" }, { status: 400 });
  await g.db.delete(users).where(eq(users.id, g.target.id));
  return NextResponse.json({ ok: true });
}
