import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, users } from "@e-suite/db";
import { apiUser, baseUrl, createMagicLink, sameOrigin, sendMagicLink, throttled } from "@/lib/auth";
import { isEmail } from "@/lib/admin";

const ROLES = ["admin", "client_editor", "client_viewer"] as const;

/** Adds a person who can sign in, and optionally emails them a first sign-in link. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const me = await apiUser(["admin"]);
  if (!me) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const email = String(b?.email ?? "").trim().toLowerCase();
  const role = ROLES.find((r) => r === b?.role);
  if (!isEmail(email)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  if (!role) return NextResponse.json({ error: "Choose a role" }, { status: 400 });
  const db = await getDb();
  if ((await db.select().from(users).where(eq(users.email, email))).length) return NextResponse.json({ error: "That person already has access" }, { status: 409 });
  const [row] = await db.insert(users).values({ email, role, name: String(b?.name ?? "").trim().slice(0, 120) || null }).returning();
  let emailed = false;
  if (b?.sendLink === true && !throttled(`invite:${me.id}`, 20, 3_600_000)) {
    const link = await createMagicLink(email, baseUrl(req));
    if (link) { await sendMagicLink(email, link); emailed = true; }
  }
  return NextResponse.json({ id: row.id, emailed }, { status: 201 });
}
