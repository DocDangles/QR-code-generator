import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, qrTemplates } from "@e-suite/db";
import { apiUser, sameOrigin } from "@/lib/auth";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  if (!(await apiUser(["admin", "client_editor"]))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await (await getDb()).delete(qrTemplates).where(eq(qrTemplates.id, id));
  return NextResponse.json({ ok: true });
}
