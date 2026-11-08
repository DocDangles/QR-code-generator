import { NextResponse, type NextRequest } from "next/server";
import { baseUrl, createMagicLink, sameOrigin, sendMagicLink, throttled } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("Bad origin", { status: 403 });
  const email = String((await req.formData()).get("email") ?? "").trim().toLowerCase();
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "local";
  // Same response whether or not the email is known, so addresses can't be probed.
  if (email && !throttled(`ip:${ip}`) && !throttled(`em:${email}`, 3)) {
    const link = await createMagicLink(email, baseUrl(req));
    if (link) await sendMagicLink(email, link);
  }
  return NextResponse.redirect(new URL("/login?sent=1", req.url), 303);
}
