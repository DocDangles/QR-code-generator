import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRules, triggersFor, digestWindow } from "./notify.ts";

process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), "es-notify-"));
delete process.env.DATABASE_URL;
process.env.PUBLIC_REDIRECT_BASE = "https://go.example.org";

const TZ = "America/New_York";
let db: any, qrCodes: any, scans: any, clients: any, notificationEvents: any;
let notifyOnScan: any, runDigests: any, runNightly: any;
let client: any;

const sent: { to: string; subject: string; text: string }[] = [];
const send = async (to: string, subject: string, text: string) => { sent.push({ to, subject, text }); return true; };

before(async () => {
  ({ getDb: db, qrCodes, scans, clients, notificationEvents } = (await import("@e-suite/db")) as any);
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  ({ notifyOnScan, runDigests } = await import("./notify.ts"));
  ({ runNightly } = await import("./jobs.ts"));
  const d = await db();
  db = d;
  await migrate(d, { migrationsFolder: fileURLToPath(new URL("../../../../packages/db/drizzle", import.meta.url)) });
  [client] = await d.insert(clients).values({ name: "BEC", slug: "bec", timezone: TZ, redirectDomain: "go.example.org", fallbackUrl: "https://example.org", notifyEmail: "info@example.org" }).returning();
});

test("rules are sanitized", () => {
  assert.deepEqual(parseRules(null), { firstScan: false, everyN: null, digest: "off" });
  assert.deepEqual(parseRules({ firstScan: true, everyN: "50", digest: "weekly" }), { firstScan: true, everyN: 50, digest: "weekly" });
  assert.equal(parseRules({ everyN: 1 }).everyN, null, "every 1 scan is just noise");
  assert.equal(parseRules({ everyN: "abc", digest: "hourly" }).digest, "off");
});

test("which scans trigger one-off emails", () => {
  const r = { firstScan: true, everyN: 10, digest: "off" as const };
  assert.deepEqual(triggersFor(r, 1), { first: true, milestone: null });
  assert.deepEqual(triggersFor(r, 10), { first: false, milestone: 10 });
  assert.deepEqual(triggersFor(r, 11), { first: false, milestone: null });
  assert.deepEqual(triggersFor({ ...r, firstScan: false }, 1), { first: false, milestone: null });
});

test("digest windows follow the client's calendar, including the 25-hour fall-back day", () => {
  const monday = new Date("2026-11-02T15:00:00Z"); // Monday in New York, the day after DST ended
  const d = digestWindow("daily", monday, TZ)!;
  assert.equal(d.key, "2026-11-01");
  assert.equal(d.to.getTime() - d.from.getTime(), 25 * 3_600_000);
  const w = digestWindow("weekly", monday, TZ)!;
  assert.equal(w.key, "2026-10-26");
  assert.equal(w.label, "2026-10-26 to 2026-11-01");
  assert.equal(digestWindow("weekly", new Date("2026-11-03T15:00:00Z"), TZ), null, "weekly only goes out on Mondays");
});

const mkCode = async (name: string, o: Record<string, unknown> = {}) =>
  (await db.insert(qrCodes).values({ slug: name.toLowerCase().replace(/\W/g, "").slice(0, 6).padEnd(5, "x"), campaignName: name, destinationUrl: "https://x.org", ...o }).returning())[0];
const addScans = (codeId: string, n: number, o: Record<string, unknown> = {}) =>
  db.insert(scans).values(Array.from({ length: n }, (_, i) => ({ qrCodeId: codeId, visitorHash: `v${i}`, isUnique: i % 2 === 0, city: "Pittsburgh", country: "US", region: "Pennsylvania", deviceType: "mobile", ...o })));
const info = { city: "Pittsburgh", region: "Pennsylvania", country: "US", deviceType: "mobile", at: new Date() };

test("first-scan email goes out once, even if the hook runs twice", async () => {
  sent.length = 0;
  const code = await mkCode("Firstie", { notifyRules: { firstScan: true } });
  await addScans(code.id, 1);
  await notifyOnScan(db, client, code, info, send);
  await notifyOnScan(db, client, code, info, send);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "info@example.org");
  assert.match(sent[0].subject, /First scan: Firstie/);
  assert.match(sent[0].text, /Pittsburgh, Pennsylvania, US/);
  assert.match(sent[0].text, /https:\/\/go\.example\.org\/firs/);
});

test("threshold email on every Nth counted scan; bots don't count", async () => {
  sent.length = 0;
  const code = await mkCode("Mileage", { notifyRules: { everyN: 3 } });
  await addScans(code.id, 2);
  await addScans(code.id, 5, { bot: true });
  await notifyOnScan(db, client, code, info, send);
  assert.equal(sent.length, 0);
  await addScans(code.id, 1);
  await notifyOnScan(db, client, code, info, send);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /^3 scans/);
});

test("a failed send releases the claim so a later scan can retry", async () => {
  sent.length = 0;
  const code = await mkCode("Flaky", { notifyRules: { firstScan: true } });
  await addScans(code.id, 1);
  await notifyOnScan(db, client, code, info, async () => false);
  assert.equal((await db.select().from(notificationEvents)).filter((e: any) => e.qrCodeId === code.id).length, 0);
  await notifyOnScan(db, client, code, info, send);
  assert.equal(sent.length, 1);
});

test("codes with no rules, and clients with no email, never send", async () => {
  sent.length = 0;
  const quiet = await mkCode("Quiet");
  await addScans(quiet.id, 1);
  await notifyOnScan(db, client, quiet, info, send);
  const loud = await mkCode("Loudx", { notifyRules: { firstScan: true } });
  await addScans(loud.id, 1);
  await notifyOnScan(db, { ...client, notifyEmail: null }, loud, info, send);
  assert.equal(sent.length, 0);
});

test("digests: only due, non-empty, once per period", async () => {
  sent.length = 0;
  const monday = new Date("2026-11-02T15:00:00Z");
  const at = new Date("2026-10-30T16:00:00Z"); // inside the weekly window, outside yesterday's
  const busy = await mkCode("Busyweek", { notifyRules: { digest: "weekly" } });
  await addScans(busy.id, 4, { scannedAt: at });
  await addScans(busy.id, 2, { scannedAt: at, bot: true });
  const empty = await mkCode("Emptyweek", { notifyRules: { digest: "weekly" } });
  const daily = await mkCode("Dailyx", { notifyRules: { digest: "daily" } });
  await addScans(daily.id, 3, { scannedAt: new Date("2026-11-01T17:00:00Z") });
  const r1 = await runDigests(db, client, monday, send);
  assert.deepEqual(r1, { sent: 2, skippedEmpty: 1, alreadySent: 0 });
  const week = sent.find((s) => /Weekly/.test(s.subject))!;
  assert.match(week.text, /Scans: 4\n/, "bots excluded");
  assert.match(week.text, /Unique clicks: 2/);
  const r2 = await runDigests(db, client, monday, send);
  assert.deepEqual(r2, { sent: 0, skippedEmpty: 1, alreadySent: 2 });
  const tuesday = await runDigests(db, client, new Date("2026-11-03T15:00:00Z"), send);
  assert.equal(tuesday.sent, 0, "weekly not due on a Tuesday; daily window has no scans");
  void empty;
});

test("nightly job expires overdue active codes only", async () => {
  const past = new Date(Date.now() - 3600_000), future = new Date(Date.now() + 86_400_000);
  const a = await mkCode("Overdue", { expiresAt: past });
  const b = await mkCode("Future", { expiresAt: future });
  const c = await mkCode("Pausedx", { expiresAt: past, status: "paused" });
  const r = await runNightly(db, new Date(), send);
  assert.equal(r.expired, 1);
  const status = async (id: string) => (await db.select().from(qrCodes)).find((x: any) => x.id === id).status;
  assert.equal(await status(a.id), "expired");
  assert.equal(await status(b.id), "active");
  assert.equal(await status(c.id), "paused");
});
