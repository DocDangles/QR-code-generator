import { NextResponse, type NextRequest } from "next/server";
import { clearedCookie, sameOrigin } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("Bad origin", { status: 403 });
  const c = clearedCookie();
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
