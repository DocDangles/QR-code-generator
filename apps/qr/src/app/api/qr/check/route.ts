import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { readBarcodes } from "zxing-wasm/reader";
import { apiUser, sameOrigin } from "@/lib/auth";
import { renderQrSvg } from "@/lib/qr/render";

/** Renders the design the way a phone camera would see it and tries to decode it. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  if (!(await apiUser())) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { data, style } = await req.json().catch(() => ({}));
  if (typeof data !== "string" || !data || data.length > 2048) return NextResponse.json({ error: "Bad data" }, { status: 400 });
  const png = await sharp(Buffer.from(renderQrSvg(data, style))).resize(500).flatten({ background: "#fff" }).png().toBuffer();
  const [hit] = await readBarcodes(new Blob([new Uint8Array(png)], { type: "image/png" }), { formats: ["QRCode"], tryHarder: true });
  return NextResponse.json({ ok: hit?.text === data });
}
