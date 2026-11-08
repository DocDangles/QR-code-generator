import { NextResponse, type NextRequest } from "next/server";
import { consumeToken, sessionCookie } from "@/lib/auth";

// GET with a token consumes it; prefetchers that don't run it as a browser won't have the cookie jar to abuse.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const user = token ? await consumeToken(token) : null;
  if (!user) return NextResponse.redirect(new URL("/login?error=1", req.url), 303);
  const c = sessionCookie(user.id);
  const res = NextResponse.redirect(new URL("/dashboard", req.url), 303);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
