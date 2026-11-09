import { and, eq, gte, lt, sql, desc } from "drizzle-orm";
import { qrCodes, scans, notificationEvents } from "@e-suite/db";
import { sendEmail } from "./mail";
import { redirectBase } from "./redirect";
import { addDays, fmt, localDay, startOfLocalDay } from "./range";

type Db = any;
export type NotifyRules = { firstScan: boolean; everyN: number | null; digest: "off" | "daily" | "weekly" };
export const DEFAULT_RULES: NotifyRules = { firstScan: false, everyN: null, digest: "off" };

/** Validates untrusted rules JSON (from the browser or the database). */
export function parseRules(v: unknown): NotifyRules {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const n = Math.floor(Number(o.everyN));
  return {
    firstScan: o.firstScan === true,
    everyN: Number.isFinite(n) && n >= 2 && n <= 100_000 ? n : null,
    digest: o.digest === "daily" || o.digest === "weekly" ? o.digest : "off",
  };
}

/** Which one-off emails does the code's Nth counted scan call for? */
export function triggersFor(rules: NotifyRules, count: number): { first: boolean; milestone: number | null } {
  return {
    first: rules.firstScan && count === 1,
    milestone: rules.everyN && count > 0 && count % rules.everyN === 0 ? count : null,
  };
}

export type DigestWindow = { from: Date; to: Date; key: string; label: string };

/** The period a digest covers if one is due now, in the client's time zone: yesterday (daily) or the last 7 days on Mondays (weekly). */
export function digestWindow(kind: "daily" | "weekly", now: Date, tz: string): DigestWindow | null {
  const today = localDay(now, tz);
  if (kind === "daily") {
    const y = addDays(today, -1);
    return { from: startOfLocalDay(y, tz), to: startOfLocalDay(today, tz), key: fmt(y), label: fmt(y) };
  }
  if (new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now) !== "Mon") return null;
  const start = addDays(today, -7);
  return { from: startOfLocalDay(start, tz), to: startOfLocalDay(today, tz), key: fmt(start), label: `${fmt(start)} to ${fmt(addDays(today, -1))}` };
}

/** Claims an email slot. True only for the first caller, so concurrent scans can't double-send. */
async function claim(db: Db, qrCodeId: string, kind: string, key: string): Promise<boolean> {
  const rows = await db.insert(notificationEvents).values({ qrCodeId, kind, key }).onConflictDoNothing().returning({ id: notificationEvents.id });
  return rows.length > 0;
}
async function release(db: Db, qrCodeId: string, kind: string, key: string) {
  await db.delete(notificationEvents).where(and(eq(notificationEvents.qrCodeId, qrCodeId), eq(notificationEvents.kind, kind as any), eq(notificationEvents.key, key)));
}

type Client = { notifyEmail: string | null; timezone: string; redirectDomain: string; name: string };
type Code = typeof qrCodes.$inferSelect;
type Send = (to: string, subject: string, text: string) => Promise<boolean>;

const when = (d: Date, tz: string) => d.toLocaleString("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" });

/** Called in the background after a counted scan is saved, never inside the redirect. Failures are logged, never thrown. */
export async function notifyOnScan(
  db: Db, client: Client, code: Code, scan: { city: string | null; region: string | null; country: string | null; deviceType: string | null; at: Date },
  send: Send = sendEmail,
): Promise<void> {
  try {
    const rules = parseRules(code.notifyRules);
    if (!client.notifyEmail || (!rules.firstScan && !rules.everyN)) return;
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(scans).where(and(eq(scans.qrCodeId, code.id), eq(scans.bot, false)));
    const t = triggersFor(rules, n);
    const link = `${redirectBase(client.redirectDomain)}/${code.slug}`;
    const where = [scan.city, scan.region, scan.country].filter(Boolean).join(", ") || "an unknown location";
    const jobs: [string, string, string, string][] = [];
    if (t.first) jobs.push(["first_scan", "first", `First scan: ${code.campaignName}`,
      `Your QR code "${code.campaignName}" was scanned for the first time.\n\nWhen: ${when(scan.at, client.timezone)}\nWhere: ${where}\nDevice: ${scan.deviceType ?? "unknown"}\nShort link: ${link}\n`]);
    if (t.milestone) jobs.push(["threshold", String(t.milestone), `${t.milestone} scans: ${code.campaignName}`,
      `Your QR code "${code.campaignName}" has reached ${t.milestone.toLocaleString("en-US")} scans.\n\nShort link: ${link}\n`]);
    for (const [kind, key, subject, text] of jobs) {
      if (!(await claim(db, code.id, kind, key))) continue;
      if (!(await send(client.notifyEmail, subject, text))) await release(db, code.id, kind, key); // let a later scan retry
    }
  } catch (e) {
    console.error("notification failed", e);
  }
}

/** Sends every digest that is due. Safe to run as often as you like: each period is sent once. Empty periods are skipped. */
export async function runDigests(db: Db, client: Client, now = new Date(), send: Send = sendEmail) {
  const out = { sent: 0, skippedEmpty: 0, alreadySent: 0 };
  if (!client.notifyEmail) return out;
  const codes: Code[] = await db.select().from(qrCodes).where(eq(qrCodes.mode, "dynamic"));
  for (const code of codes) {
    const rules = parseRules(code.notifyRules);
    if (rules.digest === "off") continue;
    const w = digestWindow(rules.digest, now, client.timezone);
    if (!w) continue;
    const kind = rules.digest === "daily" ? "digest_daily" : "digest_weekly";
    const range = and(eq(scans.qrCodeId, code.id), eq(scans.bot, false), gte(scans.scannedAt, w.from), lt(scans.scannedAt, w.to));
    const [tot] = await db.select({ n: sql<number>`count(*)::int`, u: sql<number>`count(*) filter (where ${scans.isUnique})::int` }).from(scans).where(range);
    if (tot.n === 0) { out.skippedEmpty++; continue; }
    if (!(await claim(db, code.id, kind, w.key))) { out.alreadySent++; continue; }
    const top = async (col: any) => (await db.select({ k: sql<string>`coalesce(${col}, 'Unknown')`, n: sql<number>`count(*)::int` }).from(scans).where(range).groupBy(sql`1`).orderBy(desc(sql`2`), sql`1`).limit(3))
      .map((r: any) => `${r.k} (${r.n})`).join(", ");
    const text = `${rules.digest === "daily" ? "Daily" : "Weekly"} summary for "${code.campaignName}", ${w.label} (${client.timezone}):\n\n` +
      `Scans: ${tot.n}\nUnique clicks: ${tot.u}\nTop cities: ${await top(scans.city)}\nDevices: ${await top(scans.deviceType)}\n\n` +
      `Short link: ${redirectBase(client.redirectDomain)}/${code.slug}\n`;
    if (await send(client.notifyEmail, `${rules.digest === "daily" ? "Daily" : "Weekly"} scans: ${code.campaignName}`, text)) out.sent++;
    else await release(db, code.id, kind, w.key);
  }
  return out;
}
