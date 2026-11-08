import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), "es-stats-"));
delete process.env.DATABASE_URL;

let getDb: any, qrCodes: any, scans: any, overview: any, codeRows: any, codeStats: any, parseRange: any;

const TZ = "America/New_York";
const NOW = new Date("2026-11-08T15:00:00Z");
let a: string, b: string;

before(async () => {
  ({ getDb, qrCodes, scans } = await import("@e-suite/db"));
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  ({ overview, codeRows, codeStats } = await import("./stats.ts"));
  ({ parseRange } = await import("./range.ts"));
  const db = await getDb();
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../../../packages/db/drizzle", import.meta.url)) });
  [{ id: a }, { id: b }] = await db.insert(qrCodes).values([
    { slug: "aaaaa2", campaignName: "Alpha Reel", destinationUrl: "https://x.org/a" },
    { slug: "bbbbb2", campaignName: "Beta Flyer", destinationUrl: "https://x.org/b", status: "paused" },
  ]).returning({ id: qrCodes.id });
  const mk = (id: string, at: string, o: Record<string, unknown> = {}) => ({ qrCodeId: id, scannedAt: new Date(at), visitorHash: "h", isUnique: true, deviceType: "mobile", country: "US", region: "Pennsylvania", city: "Pittsburgh", ...o });
  await db.insert(scans).values([
    mk(a, "2026-11-07T14:00:00Z"),
    mk(a, "2026-11-07T15:00:00Z", { isUnique: false }),
    mk(a, "2026-11-08T03:30:00Z", { country: "GB", city: "London", region: "England", deviceType: "desktop" }), // 10:30 PM on the 7th, New York
    mk(a, "2026-11-07T16:00:00Z", { bot: true }), // never counted
    mk(a, "2026-09-01T12:00:00Z"), // outside the 30-day range
    mk(b, "2026-11-06T12:00:00Z", { country: null, city: null, region: null, deviceType: "tablet" }),
  ]);
});

test("overview counts clicks and uniques, excludes bots and out-of-range scans", async () => {
  const o = await overview(await getDb(), parseRange({}, TZ, NOW));
  assert.deepEqual(o, { codesTotal: 2, codesActive: 1, clicks: 4, uniques: 3 });
});
test("results table: per-code counts, search and sort", async () => {
  const db = await getDb(), r = parseRange({}, TZ, NOW);
  const rows = await codeRows(db, r);
  assert.deepEqual(rows.map((x: any) => [x.campaignName, x.scans, x.uniques]), [["Alpha Reel", 3, 2], ["Beta Flyer", 1, 1]]);
  assert.deepEqual((await codeRows(db, r, { q: "flyer" })).map((x: any) => x.campaignName), ["Beta Flyer"]);
  assert.deepEqual((await codeRows(db, r, { q: "100%" })).length, 0); // LIKE wildcards are escaped
  assert.deepEqual((await codeRows(db, r, { sort: "name", dir: "asc" })).map((x: any) => x.campaignName), ["Alpha Reel", "Beta Flyer"]);
});
test("per-code series puts the 10:30 PM scan on the 7th (client time zone) and fills empty days", async () => {
  const s = await codeStats(await getDb(), a, parseRange({ from: "2026-11-06", to: "2026-11-08" }, TZ, NOW));
  assert.deepEqual(s.points, [
    { key: "2026-11-06", scans: 0, uniques: 0 },
    { key: "2026-11-07", scans: 3, uniques: 2 },
    { key: "2026-11-08", scans: 0, uniques: 0 },
  ]);
  assert.equal(s.total, 3);
});
test("hourly series for a single day", async () => {
  const s = await codeStats(await getDb(), a, parseRange({ from: "2026-11-07", to: "2026-11-07" }, TZ, NOW));
  assert.equal(s.points.length, 24);
  assert.equal(s.points.find((p: any) => p.key === "2026-11-07 09")?.scans, 1); // 14:00Z = 9 AM EST
  assert.equal(s.points.find((p: any) => p.key === "2026-11-07 22")?.scans, 1);
});
test("breakdowns", async () => {
  const s = await codeStats(await getDb(), a, parseRange({}, TZ, NOW));
  assert.deepEqual(s.device, [{ label: "mobile", n: 2 }, { label: "desktop", n: 1 }]);
  assert.deepEqual(s.countries, [{ label: "US", n: 2 }, { label: "GB", n: 1 }]);
  const none = await codeStats(await getDb(), b, parseRange({}, TZ, NOW));
  assert.deepEqual(none.countries, [{ label: "Unknown", n: 1 }]);
});
