import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, qrCodes, destinationHistory } from "@e-suite/db";
import { apiUser, sameOrigin } from "@/lib/auth";
import { clearSlugCache, parseCodeInput } from "@/lib/codes";

const UUID = /^[0-9a-f-]{36}$/i;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const user = await apiUser(["admin", "client_editor"]);
  if (!user) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await getDb();
  const [cur] = await db.select().from(qrCodes).where(eq(qrCodes.id, id));
  if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let input;
  try { input = parseCodeInput({ ...(await req.json()), mode: cur.mode }); } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }

  if (cur.mode === "static") {
    // A static code's image IS its destination: changing it would change the printed picture.
    const changed = input.destinationUrl !== cur.destinationUrl || input.utmSource !== cur.utmSource || input.utmMedium !== cur.utmMedium ||
      input.utmCampaign !== cur.utmCampaign || input.utmContent !== cur.utmContent || input.utmTerm !== cur.utmTerm;
    if (changed) return NextResponse.json({ error: "A static code's destination can't be edited. Create a dynamic code if you need to change it later." }, { status: 400 });
  }

  await db.update(qrCodes).set({
    campaignName: input.campaignName, destinationUrl: input.destinationUrl,
    utmSource: input.utmSource, utmMedium: input.utmMedium, utmCampaign: input.utmCampaign, utmContent: input.utmContent, utmTerm: input.utmTerm,
    status: input.status, expiresAt: input.expiresAt, expireRedirectUrl: input.expireRedirectUrl, style: input.style, updatedAt: new Date(),
  }).where(eq(qrCodes.id, id));
  if (cur.mode === "dynamic" && input.destinationUrl !== cur.destinationUrl) {
    await db.insert(destinationHistory).values({ qrCodeId: id, oldUrl: cur.destinationUrl, newUrl: input.destinationUrl, changedBy: user.id });
  }
  clearSlugCache(cur.slug);
  return NextResponse.json({ ok: true });
}
