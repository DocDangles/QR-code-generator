import { and, eq, gte, lt, lte, ilike, sql, desc } from "drizzle-orm";
import { qrCodes, scans, scanDaily } from "@e-suite/db";
import { bucketKeys, type Range } from "./range";

type Db = any;
const inRange = (r: Range) => and(gte(scans.scannedAt, r.from), lt(scans.scannedAt, r.to), eq(scans.bot, false));
/** Summarized days (older than the retention period) that fall inside the range. Raw rows for those days no longer exist, so nothing is counted twice. */
const archived = (r: Range) => and(gte(scanDaily.day, r.fromStr), lte(scanDaily.day, r.toStr));

export async function overview(db: Db, r: Range) {
  const [t] = await db.select({
    total: sql<number>`count(*)::int`,
    active: sql<number>`count(*) filter (where ${qrCodes.status} = 'active')::int`,
  }).from(qrCodes);
  const [s] = await db.select({
    clicks: sql<number>`count(*)::int`,
    uniques: sql<number>`count(*) filter (where ${scans.isUnique})::int`,
  }).from(scans).where(inRange(r));
  const [a] = await db.select({ n: sql<number>`coalesce(sum(${scanDaily.scans}), 0)::int`, u: sql<number>`coalesce(sum(${scanDaily.uniques}), 0)::int` }).from(scanDaily).where(archived(r));
  return { codesTotal: t.total as number, codesActive: t.active as number, clicks: (s.clicks + a.n) as number, uniques: (s.uniques + a.u) as number };
}

export type SortKey = "name" | "scans" | "type";
export async function codeRows(db: Db, r: Range, opts: { q?: string; sort?: SortKey; dir?: "asc" | "desc" } = {}) {
  const q = opts.q?.trim().slice(0, 100);
  const codes = await db.select().from(qrCodes)
    .where(q ? ilike(qrCodes.campaignName, `%${q.replace(/[%_\\]/g, "\\$&")}%`) : undefined);
  const counts = await db.select({
    id: scans.qrCodeId, n: sql<number>`count(*)::int`, u: sql<number>`count(*) filter (where ${scans.isUnique})::int`,
  }).from(scans).where(inRange(r)).groupBy(scans.qrCodeId);
  const by = new Map<string, { n: number; u: number }>(counts.map((c: any) => [c.id, { n: c.n, u: c.u }]));
  const old = await db.select({ id: scanDaily.qrCodeId, n: sql<number>`sum(${scanDaily.scans})::int`, u: sql<number>`sum(${scanDaily.uniques})::int` }).from(scanDaily).where(archived(r)).groupBy(scanDaily.qrCodeId);
  for (const o of old) { const cur = by.get(o.id) ?? { n: 0, u: 0 }; by.set(o.id, { n: cur.n + o.n, u: cur.u + o.u }); }
  const rows = codes.map((c: any) => ({ ...c, scans: by.get(c.id)?.n ?? 0, uniques: by.get(c.id)?.u ?? 0 }));
  const sort = opts.sort ?? "scans", dir = opts.dir === "asc" ? 1 : -1;
  rows.sort((a: any, b: any) => {
    const cmp = sort === "name" ? a.campaignName.localeCompare(b.campaignName) : sort === "type" ? a.mode.localeCompare(b.mode) : a.scans - b.scans;
    return cmp ? cmp * dir : a.campaignName.localeCompare(b.campaignName);
  });
  return rows as (typeof codes[number] & { scans: number; uniques: number })[];
}

type Count = { label: string; n: number };
export async function codeStats(db: Db, codeId: string, r: Range) {
  const where = and(eq(scans.qrCodeId, codeId), inRange(r));
  const pattern = r.hourly ? "YYYY-MM-DD HH24" : "YYYY-MM-DD";
  const bucket = sql<string>`to_char(${scans.scannedAt} AT TIME ZONE ${r.tz}, ${pattern})`;
  const series = await db.select({ k: bucket, n: sql<number>`count(*)::int`, u: sql<number>`count(*) filter (where ${scans.isUnique})::int` })
    .from(scans).where(where).groupBy(sql`1`);
  const byKey = new Map<string, { n: number; u: number }>(series.map((x: any) => [x.k, { n: x.n, u: x.u }]));
  const arch: any[] = await db.select().from(scanDaily).where(and(eq(scanDaily.qrCodeId, codeId), archived(r)));
  if (!r.hourly) for (const a of arch) { const cur = byKey.get(a.day) ?? { n: 0, u: 0 }; byKey.set(a.day, { n: cur.n + a.scans, u: cur.u + a.uniques }); }
  const points = bucketKeys(r).map((k) => ({ key: k, scans: byKey.get(k)?.n ?? 0, uniques: byKey.get(k)?.u ?? 0 }));
  // An hourly view can't be split further than a day, so archived days only add to the totals there.
  const archivedExtra = r.hourly ? { scans: arch.reduce((x, a) => x + a.scans, 0), uniques: arch.reduce((x, a) => x + a.uniques, 0) } : { scans: 0, uniques: 0 };
  const fold = (rows: Count[], field: "byDevice" | "byCountry", limit: number): Count[] => {
    const m = new Map<string, number>(rows.map((x) => [x.label, x.n]));
    for (const a of arch) for (const [k, v] of Object.entries(a[field] as Record<string, number>)) m.set(k, (m.get(k) ?? 0) + v);
    return [...m].map(([label, n]) => ({ label, n })).sort((x, y) => y.n - x.n || x.label.localeCompare(y.label)).slice(0, limit);
  };

  const top = async (col: any, limit = 8): Promise<Count[]> => {
    const rows = await db.select({ label: sql<string>`coalesce(${col}, 'Unknown')`, n: sql<number>`count(*)::int` })
      .from(scans).where(where).groupBy(sql`1`).orderBy(desc(sql`2`), sql`1`).limit(limit);
    return rows.map((x: any) => ({ label: x.label, n: x.n }));
  };
  const [device, os, browser, countries, regions, cities] = await Promise.all([
    top(scans.deviceType), top(scans.os), top(scans.browser), top(scans.country, 300), top(scans.region, 80), top(scans.city, 8),
  ]);
  const total = points.reduce((a, p) => a + p.scans, 0) + archivedExtra.scans;
  const uniques = points.reduce((a, p) => a + p.uniques, 0) + archivedExtra.uniques;
  return { points, total, uniques, device: fold(device, "byDevice", 8), os, browser, countries: fold(countries, "byCountry", 300), regions, cities, hasArchive: arch.length > 0 };
}
