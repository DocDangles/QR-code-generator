import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { retentionCutoff } from "./retention.ts";

process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), "es-retention-"));
delete process.env.DATABASE_URL;

const TZ = "America/New_York";
const NOW = new Date("2026-11-08T15:00:00Z");
let db: any, qrCodes: any, scans: any, scanDaily: any, loginTokens: any;
let runRetention: any, overview: any, codeRows: any, codeStats: any, parseRange: any;
let codeId: string, otherId: string;

test("cutoff is local midnight N calendar months back, clamped at month ends", () => {
  assert.equal(retentionCutoff(NOW, TZ, 13).toISOString(), "2025-10-08T04:00:00.000Z"); // EDT midnight
  assert.equal(retentionCutoff(new Date("2026-03-31T16:00:00Z"), TZ, 1).toISOString(), "2026-02-28T05:00:00.000Z"); // Feb has no 31st
  assert.equal(retentionCutoff(new Date("2026-02-10T16:00:00Z"), TZ, 13).toISOString(), "2025-01-10T05:00:00.000Z"); // across a year
});

before(async () => {
  ({ getDb: db, qrCodes, scans, scanDaily, loginTokens } = (await import("@e-suite/db")) as any);
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  ({ runRetention } = await import("./retention.ts"));
  ({ overview, codeRows, codeStats } = await import("./stats.ts"));
  ({ parseRange } = await import("./range.ts"));
  db = await db();
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../../../packages/db/drizzle", import.meta.url)) });
  [{ id: codeId }, { id: otherId }] = await db.insert(qrCodes).values([
    { slug: "retn22", campaignName: "Old flyer", destinationUrl: "https://x.org" },
    { slug: "retn33", campaignName: "Other", destinationUrl: "https://x.org" },
  ]).returning({ id: qrCodes.id });
  const mk = (id: string, at: string, o: Record<string, unknown> = {}) => ({ qrCodeId: id, scannedAt: new Date(at), visitorHash: "h", isUnique: true, deviceType: "mobile", country: "US", ...o });
  await db.insert(scans).values([
    mk(codeId, "2025-10-07T15:00:00Z"),
    mk(codeId, "2025-10-07T16:00:00Z", { isUnique: false, deviceType: "desktop" }),
    mk(codeId, "2025-10-07T17:00:00Z", { country: "GB" }),
    mk(codeId, "2025-10-07T02:00:00Z"), // 10 PM on Oct 6 in New York: belongs to the 6th
    mk(codeId, "2025-10-07T18:00:00Z", { bot: true }), // pruned, never summarized
    mk(otherId, "2025-10-05T12:00:00Z", { country: null, deviceType: null }),
    mk(codeId, "2025-10-08T05:00:00Z"), // 1 AM Oct 8 local: on/after the cutoff, stays raw
    mk(codeId, "2026-11-01T12:00:00Z"),
  ]);
  await db.insert(loginTokens).values([
    { tokenHash: "stale", email: "a@b.c", expiresAt: new Date("2026-11-01T00:00:00Z") },
    { tokenHash: "fresh", email: "a@b.c", expiresAt: new Date("2026-11-09T00:00:00Z") },
  ]);
});

test("old scans become daily summaries in the client's time zone, raw rows are pruned", async () => {
  const r = await runRetention(db, TZ, NOW, 13);
  assert.deepEqual(r, { cutoff: "2025-10-08", summarizedDays: 3, prunedScans: 6 });
  const rows = (await db.select().from(scanDaily)).map((x: any) => [x.qrCodeId === codeId ? "A" : "B", x.day, x.scans, x.uniques, x.byDevice, x.byCountry]);
  rows.sort();
  assert.deepEqual(rows, [
    ["A", "2025-10-06", 1, 1, { mobile: 1 }, { US: 1 }],
    ["A", "2025-10-07", 3, 2, { mobile: 2, desktop: 1 }, { US: 2, GB: 1 }],
    ["B", "2025-10-05", 1, 1, { Unknown: 1 }, { Unknown: 1 }],
  ]);
  assert.equal((await db.select().from(scans)).length, 2, "recent scans untouched");
});

test("re-running changes nothing", async () => {
  const r = await runRetention(db, TZ, NOW, 13);
  assert.deepEqual(r, { cutoff: "2025-10-08", summarizedDays: 0, prunedScans: 0 });
  assert.equal((await db.select().from(scanDaily)).length, 3);
});

test("stale sign-in tokens are cleared, fresh ones kept", async () => {
  const left = (await db.select().from(loginTokens)).map((t: any) => t.tokenHash);
  assert.deepEqual(left, ["fresh"]);
});

test("a range spanning the cutoff counts archived and raw data together", async () => {
  const range = parseRange({ from: "2025-10-05", to: "2025-10-10" }, TZ, NOW);
  assert.deepEqual(await overview(db, range), { codesTotal: 2, codesActive: 2, clicks: 6, uniques: 5 }); // archive 1+3+1, plus the raw scan on Oct 8
  const rows = await codeRows(db, range);
  assert.deepEqual(rows.map((x: any) => [x.campaignName, x.scans]), [["Old flyer", 5], ["Other", 1]]); // 4 archived + 1 raw; 1 archived
});

test("per-code stats merge archived days into the chart, devices and countries", async () => {
  const range = parseRange({ from: "2025-10-06", to: "2025-10-08" }, TZ, NOW);
  const s = await codeStats(db, codeId, range);
  assert.deepEqual(s.points.map((p: any) => [p.key, p.scans]), [["2025-10-06", 1], ["2025-10-07", 3], ["2025-10-08", 1]]);
  assert.equal(s.total, 5);
  assert.deepEqual(s.device, [{ label: "mobile", n: 4 }, { label: "desktop", n: 1 }]);
  assert.deepEqual(s.countries, [{ label: "US", n: 4 }, { label: "GB", n: 1 }]);
  assert.equal(s.hasArchive, true);
});

test("an hourly view of an archived day still reports the day's total", async () => {
  const s = await codeStats(db, codeId, parseRange({ from: "2025-10-07", to: "2025-10-07" }, TZ, NOW));
  assert.equal(s.points.length, 24);
  assert.equal(s.total, 3);
});

test("ranges after the cutoff are unaffected by the archive", async () => {
  const s = await codeStats(db, codeId, parseRange({}, TZ, NOW));
  assert.equal(s.total, 1);
  assert.equal(s.hasArchive, false);
});
