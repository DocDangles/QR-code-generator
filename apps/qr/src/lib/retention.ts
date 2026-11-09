import { and, lt, eq, sql, inArray } from "drizzle-orm";
import { scans, scanDaily, loginTokens } from "@e-suite/db";
import { fmt, localDay, startOfLocalDay } from "./range";

type Db = any;

/** The local midnight that is `months` calendar months before today. Scans older than this are rolled up and pruned. */
export function retentionCutoff(now: Date, tz: string, months: number): Date {
  const t = localDay(now, tz);
  const total = t.y * 12 + (t.m - 1) - months;
  const y = Math.floor(total / 12), m = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // clamp: Mar 31 minus 1 month is Feb 28/29
  return startOfLocalDay({ y, m, d: Math.min(t.d, lastDay) }, tz);
}

export const retentionMonths = () => {
  const n = Number(process.env.RETENTION_MONTHS);
  return Number.isFinite(n) && n >= 1 && n <= 120 ? Math.floor(n) : 13;
};

const mergeCounts = (a: Record<string, number>, b: Record<string, number>) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
};

/**
 * Rolls every counted (non-bot) scan older than the cutoff into one scan_daily row per code per local day,
 * then prunes all raw scans older than the cutoff, in a single transaction so a failure can't lose data.
 * Safe to re-run: once a day is rolled up its raw rows are gone.
 */
export async function runRetention(db: Db, tz: string, now = new Date(), months = retentionMonths()) {
  const cutoff = retentionCutoff(now, tz, months);
  const day = sql<string>`to_char(${scans.scannedAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`;
  const old = and(lt(scans.scannedAt, cutoff), eq(scans.bot, false));

  return db.transaction(async (tx: Db) => {
    const totals = await tx.select({ code: scans.qrCodeId, day, n: sql<number>`count(*)::int`, u: sql<number>`count(*) filter (where ${scans.isUnique})::int` })
      .from(scans).where(old).groupBy(scans.qrCodeId, sql`2`);
    const devices = await tx.select({ code: scans.qrCodeId, day, k: sql<string>`coalesce(${scans.deviceType}, 'Unknown')`, n: sql<number>`count(*)::int` })
      .from(scans).where(old).groupBy(scans.qrCodeId, sql`2`, sql`3`);
    const countries = await tx.select({ code: scans.qrCodeId, day, k: sql<string>`coalesce(${scans.country}, 'Unknown')`, n: sql<number>`count(*)::int` })
      .from(scans).where(old).groupBy(scans.qrCodeId, sql`2`, sql`3`);

    const rows = new Map<string, { code: string; day: string; scans: number; uniques: number; byDevice: Record<string, number>; byCountry: Record<string, number> }>();
    const key = (code: string, d: string) => `${code}|${d}`;
    for (const t of totals) rows.set(key(t.code, t.day), { code: t.code, day: t.day, scans: t.n, uniques: t.u, byDevice: {}, byCountry: {} });
    for (const d of devices) rows.get(key(d.code, d.day))!.byDevice[d.k] = d.n;
    for (const c of countries) rows.get(key(c.code, c.day))!.byCountry[c.k] = c.n;

    // A day can already have a summary if the time zone setting changed; fold it in rather than overwrite.
    const existing = rows.size
      ? await tx.select().from(scanDaily).where(inArray(scanDaily.qrCodeId, [...new Set([...rows.values()].map((r) => r.code))]))
      : [];
    const have = new Map<string, any>(existing.map((e: any) => [key(e.qrCodeId, e.day), e]));

    for (const r of rows.values()) {
      const prev = have.get(key(r.code, r.day));
      const merged = {
        qrCodeId: r.code, day: r.day,
        scans: r.scans + (prev?.scans ?? 0), uniques: r.uniques + (prev?.uniques ?? 0),
        byDevice: mergeCounts(prev?.byDevice ?? {}, r.byDevice), byCountry: mergeCounts(prev?.byCountry ?? {}, r.byCountry),
      };
      await tx.insert(scanDaily).values(merged).onConflictDoUpdate({
        target: [scanDaily.qrCodeId, scanDaily.day],
        set: { scans: merged.scans, uniques: merged.uniques, byDevice: merged.byDevice, byCountry: merged.byCountry },
      });
    }

    const pruned = await tx.delete(scans).where(lt(scans.scannedAt, cutoff)).returning({ id: scans.id }); // includes bot rows, which are never summarized
    // Sign-in links are single-use and expire in 15 minutes; nothing needs them after a day.
    await tx.delete(loginTokens).where(lt(loginTokens.expiresAt, new Date(now.getTime() - 86_400_000)));
    return { cutoff: fmt(localDay(cutoff, tz)), summarizedDays: rows.size, prunedScans: pruned.length as number };
  });
}
