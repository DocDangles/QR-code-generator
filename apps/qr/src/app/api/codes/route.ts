import { NextResponse, type NextRequest } from "next/server";
import { getDb, qrCodes, clients } from "@e-suite/db";
import { apiUser, sameOrigin } from "@/lib/auth";
import { generateSlug, parseCodeInput } from "@/lib/codes";
import { hashPassword, validatePassword } from "@/lib/password";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const user = await apiUser(["admin", "client_editor"]);
  if (!user) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const db = await getDb();
  const [client] = await db.select().from(clients).limit(1);
  const body = await req.json().catch(() => ({}));
  let input, passwordHash: string | null = null;
  try {
    input = parseCodeInput(body, client?.timezone);
    if (input.mode === "dynamic" && typeof body.password === "string" && body.password) passwordHash = await hashPassword(validatePassword(body.password));
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  const values = {
    mode: input.mode, campaignName: input.campaignName, destinationUrl: input.destinationUrl,
    utmSource: input.utmSource, utmMedium: input.utmMedium, utmCampaign: input.utmCampaign,
    utmContent: input.utmContent, utmTerm: input.utmTerm, status: input.status,
    expiresAt: input.expiresAt, expireRedirectUrl: input.expireRedirectUrl, style: input.style, notifyRules: input.notifyRules, passwordHash, createdBy: user.id,
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const slug = input.mode === "dynamic" ? generateSlug() : null; // slugs are never reused: unique index enforces it
      const [row] = await db.insert(qrCodes).values({ ...values, slug }).returning();
      return NextResponse.json({ id: row.id, slug: row.slug }, { status: 201 });
    } catch (e: any) {
      if (!String(e?.cause?.message ?? e?.message).includes("qr_codes_slug_idx")) throw e;
    }
  }
  return NextResponse.json({ error: "Could not allocate a short link, try again" }, { status: 500 });
}
