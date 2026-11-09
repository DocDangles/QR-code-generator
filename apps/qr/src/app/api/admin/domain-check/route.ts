import { promises as dns } from "node:dns";
import { NextResponse, type NextRequest } from "next/server";
import { getDb, clients } from "@e-suite/db";
import { apiUser, sameOrigin } from "@/lib/auth";
import { isPrivateAddress } from "@/lib/admin";

export const dynamic = "force-dynamic";

/**
 * Checks the redirect domain saved in settings: does DNS resolve, and does the domain actually reach this app?
 * The domain comes from the database, never from the request, so this can't be pointed at arbitrary hosts.
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  if (!(await apiUser(["admin"]))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const [client] = await (await getDb()).select().from(clients).limit(1);
  if (!client) return NextResponse.json({ error: "No client set up" }, { status: 404 });
  const host = client.redirectDomain;

  const cname = await dns.resolveCname(host).catch(() => [] as string[]);
  const addresses = [...(await dns.resolve4(host).catch(() => [])), ...(await dns.resolve6(host).catch(() => []))];
  if (addresses.length === 0) {
    return NextResponse.json({ host, cname, addresses, status: "no-dns", message: `${host} doesn't resolve yet. Add the CNAME record, then check again (DNS can take a few minutes).` });
  }
  if (addresses.some(isPrivateAddress)) {
    return NextResponse.json({ host, cname, addresses, status: "private", message: `${host} points at a private or local address, so it can't be a public QR domain.` });
  }
  try {
    const res = await fetch(`https://${host}/healthz`, { redirect: "manual", signal: AbortSignal.timeout(6000), headers: { "User-Agent": "e-suite-domain-check" } });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.ok === true && body?.app === "e-suite-qr") {
      return NextResponse.json({ host, cname, addresses, status: "ok", message: `${host} reaches this app over HTTPS. Printed codes will work.` });
    }
    return NextResponse.json({ host, cname, addresses, status: "wrong-app", message: `${host} resolves and answers over HTTPS, but not as this app (HTTP ${res.status}). Add it as a custom domain on the Railway service.` });
  } catch {
    return NextResponse.json({ host, cname, addresses, status: "unreachable", message: `${host} resolves, but https://${host}/healthz didn't answer. The custom domain may not be added on Railway yet, or its certificate is still being issued.` });
  }
}
