import { NextResponse, type NextRequest } from "next/server";
import { desc } from "drizzle-orm";
import { getDb, qrTemplates } from "@e-suite/db";
import { apiUser, sameOrigin } from "@/lib/auth";
import { normalizeStyle } from "@/lib/qr/style";

export async function GET() {
  if (!(await apiUser())) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const rows = await (await getDb()).select().from(qrTemplates).orderBy(desc(qrTemplates.createdAt));
  return NextResponse.json(rows.map((r: any) => ({ id: r.id, name: r.name, style: r.style })));
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const user = await apiUser(["admin", "client_editor"]);
  if (!user) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: "Give the template a name" }, { status: 400 });
  const [row] = await (await getDb()).insert(qrTemplates).values({ name, style: normalizeStyle(body?.style), createdBy: user.id }).returning();
  return NextResponse.json({ id: row.id, name: row.name, style: row.style }, { status: 201 });
}
