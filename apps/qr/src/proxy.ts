import { NextResponse, type NextRequest } from "next/server";

/**
 * Host gating. The domain printed on QR codes (REDIRECT_DOMAIN, e.g. go.blackequitycoalition.org) is public,
 * so on that host only the scan routes exist: /<slug>, /<slug>/unlock, /privacy and /healthz.
 * The dashboard, login and APIs are reachable only on the app's own (admin) domain.
 * With REDIRECT_DOMAIN unset (local dev) nothing is restricted.
 */
const RESERVED = new Set(["dashboard", "login", "codes", "api", "auth", "admin"]);
const SCAN_PATH = /^\/([a-z0-9]{3,12})(\/unlock)?$/;

export function proxy(req: NextRequest) {
  const redirectHost = process.env.REDIRECT_DOMAIN?.trim().toLowerCase();
  if (!redirectHost) return NextResponse.next();
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (host !== redirectHost) return NextResponse.next();

  const path = req.nextUrl.pathname;
  if (path === "/privacy" || path === "/healthz") return NextResponse.next();
  const m = SCAN_PATH.exec(path);
  if (m && !RESERVED.has(m[1])) return NextResponse.next();
  return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
