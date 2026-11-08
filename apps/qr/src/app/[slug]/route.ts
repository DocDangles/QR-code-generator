import { after, NextResponse, type NextRequest } from "next/server";
import { and, eq, gte } from "drizzle-orm";
import { getDb, clients, qrCodes, scans } from "@e-suite/db";
import { buildDestination, isValidSlug, resolveState } from "@/lib/redirect";
import { parseScan } from "@/lib/scan";

export const dynamic = "force-dynamic";

const SECRET = process.env.VISITOR_SALT_SECRET ?? "dev-only-change-me";
const TTL_MS = 60_000;
type Code = typeof qrCodes.$inferSelect;
// Shared on globalThis so saving a code (in another route bundle) can clear it.
const g = globalThis as unknown as { __codeCache?: Map<string, { at: number; code: Code | null }> };
const codeCache = (g.__codeCache ??= new Map());
let clientCache: { at: number; fallback: string } | null = null;

async function fallbackUrl(db: any): Promise<string> {
  if (clientCache && Date.now() - clientCache.at < TTL_MS) return clientCache.fallback;
  const [c] = await db.select().from(clients).limit(1);
  const fallback = c?.fallbackUrl ?? process.env.FALLBACK_URL ?? "https://blackequitycoalition.org";
  clientCache = { at: Date.now(), fallback };
  return fallback;
}

async function findCode(db: any, slug: string): Promise<Code | null> {
  const hit = codeCache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.code;
  const [code] = await db.select().from(qrCodes).where(eq(qrCodes.slug, slug)).limit(1);
  codeCache.set(slug, { at: Date.now(), code: code ?? null });
  return code ?? null;
}

function go(url: string) {
  // 302 + no-store: never 301, or browsers cache it and edits/counts silently stop working.
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const db = await getDb();
  const fallback = await fallbackUrl(db);
  if (!isValidSlug(slug)) return go(fallback);

  const code = await findCode(db, slug);
  if (!code || code.mode !== "dynamic") return go(fallback); // never a bare 404 on a printed code

  const state = resolveState(code);
  const target =
    state === "ok"
      ? buildDestination(code.destinationUrl, {
          source: code.utmSource, medium: code.utmMedium, campaign: code.utmCampaign,
          content: code.utmContent, term: code.utmTerm,
        })
      : code.expireRedirectUrl ?? fallback;

  const info = parseScan(req.headers, SECRET);
  after(async () => {
    try {
      const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
      const prior = await db.select({ id: scans.id }).from(scans)
        .where(and(eq(scans.qrCodeId, code.id), eq(scans.visitorHash, info.visitorHash), gte(scans.scannedAt, dayStart)))
        .limit(1);
      await db.insert(scans).values({ qrCodeId: code.id, status: state, isUnique: prior.length === 0, ...info });
    } catch (err) {
      console.error("scan log failed", err);
    }
  });
  return go(target);
}
