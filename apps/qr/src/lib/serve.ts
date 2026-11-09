import { createHash } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { and, eq, gte } from "drizzle-orm";
import { getDb, clients, qrCodes, scans } from "@e-suite/db";
import { buildDestination, isValidSlug, resolveState } from "./redirect";
import { clientIp, parseScan, type ScanInfo } from "./scan";
import { checkUnlockToken, makeUnlockToken, unlockCookieName, UNLOCK_TTL_S, verifyPassword } from "./password";
import { clearFailures, isLocked, recordFailure } from "./throttle";
import { sameOrigin } from "./origin";
import { notifyOnScan } from "./notify";
import { unlockPageHtml } from "./unlock-page";

type Db = any;
type Code = typeof qrCodes.$inferSelect;
type Client = typeof clients.$inferSelect;

const SECRET = process.env.VISITOR_SALT_SECRET ?? "dev-only-change-me";
const TTL_MS = 60_000;
// Shared on globalThis so saving a code (in another route bundle) can clear it.
const g = globalThis as unknown as { __codeCache?: Map<string, { at: number; code: Code | null }> };
const codeCache = (g.__codeCache ??= new Map());
let clientCache: { at: number; client: Client | null } | null = null;

async function getClient(db: Db): Promise<Client | null> {
  if (clientCache && Date.now() - clientCache.at < TTL_MS) return clientCache.client;
  const [client] = await db.select().from(clients).limit(1);
  clientCache = { at: Date.now(), client: client ?? null };
  return clientCache.client;
}
const fallbackOf = (c: Client | null) => c?.fallbackUrl ?? process.env.FALLBACK_URL ?? "https://blackequitycoalition.org";

async function findCode(db: Db, slug: string): Promise<Code | null> {
  const hit = codeCache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.code;
  const [code] = await db.select().from(qrCodes).where(eq(qrCodes.slug, slug)).limit(1);
  codeCache.set(slug, { at: Date.now(), code: code ?? null });
  return code ?? null;
}

/** 302 + no-store: never 301, or browsers cache it and edits/counts silently stop working. */
function go(url: string) {
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function page(client: Client | null, slug: string, status: number, message?: string) {
  return new NextResponse(
    unlockPageHtml({ clientName: client?.name ?? "Protected link", logoUrl: client?.logoUrl ?? null, brandColors: client?.brandColors ?? null, slug, message }),
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "frame-ancestors 'none'" } },
  );
}

const targetFor = (code: Code, state: "ok" | "paused" | "expired", fallback: string) =>
  state === "ok"
    ? buildDestination(code.destinationUrl, { source: code.utmSource, medium: code.utmMedium, campaign: code.utmCampaign, content: code.utmContent, term: code.utmTerm })
    : code.expireRedirectUrl ?? fallback;

/** Runs after the response is sent: saves the scan, then lets the notification rules look at it. */
function logScanLater(db: Db, client: Client | null, code: Code, state: string, info: ScanInfo) {
  after(async () => {
    try {
      const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
      const prior = await db.select({ id: scans.id }).from(scans)
        .where(and(eq(scans.qrCodeId, code.id), eq(scans.visitorHash, info.visitorHash), gte(scans.scannedAt, dayStart))).limit(1);
      await db.insert(scans).values({ qrCodeId: code.id, status: state, isUnique: prior.length === 0, ...info });
      if (client && state === "ok" && !info.bot) {
        await notifyOnScan(db, client, code, { city: info.city, region: info.region, country: info.country, deviceType: info.deviceType, at: new Date() });
      }
    } catch (err) {
      console.error("scan log failed", err);
    }
  });
}

export async function handleGet(req: NextRequest, slug: string) {
  const db = await getDb();
  const client = await getClient(db);
  const fallback = fallbackOf(client);
  if (!isValidSlug(slug)) return go(fallback);
  const code = await findCode(db, slug);
  if (!code || code.mode !== "dynamic") return go(fallback); // never a bare 404 on a printed code

  const state = resolveState(code);
  const info = parseScan(req.headers, SECRET);
  // Expired and paused codes skip the password: nothing is being unlocked.
  if (state === "ok" && code.passwordHash && !checkUnlockToken(req.cookies.get(unlockCookieName(slug))?.value, slug, code.passwordHash)) {
    return page(client, slug, 200);
  }
  logScanLater(db, client, code, state, info);
  return go(targetFor(code, state, fallback));
}

export async function handleUnlock(req: NextRequest, slug: string) {
  if (!sameOrigin(req)) return new NextResponse("Bad origin", { status: 403 });
  const db = await getDb();
  const client = await getClient(db);
  const fallback = fallbackOf(client);
  if (!isValidSlug(slug)) return go(fallback);
  const code = await findCode(db, slug);
  if (!code || code.mode !== "dynamic") return go(fallback);
  const state = resolveState(code);
  if (state !== "ok" || !code.passwordHash) return go(new URL(`/${slug}`, req.url).toString()); // nothing to unlock: send through the normal path

  const info = parseScan(req.headers, SECRET);
  // Lock on the visitor fingerprint AND on the address alone, so changing the user agent doesn't reset the count.
  const keys = [`v:${slug}:${info.visitorHash}`, `ip:${slug}:${createHash("sha256").update(clientIp(req.headers)).digest("hex")}`];
  if (keys.some((k) => isLocked(k))) return page(client, slug, 429, "Too many wrong attempts. Try again in 15 minutes.");

  const given = String((await req.formData().catch(() => null))?.get("password") ?? "").slice(0, 200);
  if (!given || !(await verifyPassword(given, code.passwordHash))) {
    keys.forEach((k) => recordFailure(k));
    return page(client, slug, 401, "That password isn't right.");
  }
  keys.forEach(clearFailures);
  logScanLater(db, client, code, state, info); // the scan counts only once the password succeeds
  const res = go(targetFor(code, state, fallback));
  res.cookies.set(unlockCookieName(slug), makeUnlockToken(slug, code.passwordHash), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: UNLOCK_TTL_S,
  });
  return res;
}
