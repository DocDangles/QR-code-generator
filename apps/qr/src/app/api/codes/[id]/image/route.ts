import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb, qrCodes, clients } from "@e-suite/db";
import { apiUser } from "@/lib/auth";
import { qrTarget } from "@/lib/codes";
import { renderQrSvg } from "@/lib/qr/render";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await apiUser())) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await getDb();
  const [code] = await db.select().from(qrCodes).where(eq(qrCodes.id, id));
  const [client] = await db.select().from(clients).limit(1);
  if (!code || !client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const svg = renderQrSvg(qrTarget(code, client.redirectDomain), code.style);
  const base = code.campaignName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "qr-code";
  const format = req.nextUrl.searchParams.get("format") === "png" ? "png" : "svg";
  if (format === "svg") {
    return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Content-Disposition": `attachment; filename="${base}.svg"`, "Cache-Control": "no-store" } });
  }
  const px = Math.min(4000, Math.max(300, Number(req.nextUrl.searchParams.get("size")) || 1200));
  const png = await sharp(Buffer.from(svg), { density: 300 }).resize(px).png().toBuffer();
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="${base}.png"`, "Cache-Control": "no-store" } });
}
