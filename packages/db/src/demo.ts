// DEV ONLY: fills the local embedded database with realistic fake scans so the dashboard has something to show.
//   npm run db:demo            add ~30 days of fake scans to every dynamic code
//   npm run db:demo -- --clear delete ALL scans
import { getDb, qrCodes, scans } from "./index.ts";

if (process.env.DATABASE_URL) {
  console.error("Refusing to run against DATABASE_URL: this script fabricates scan data and is for the local dev database only.");
  process.exit(1);
}
const db = await getDb();
if (process.argv.includes("--clear")) {
  await db.delete(scans);
  console.log("all scans deleted");
  process.exit(0);
}

const pick = <T,>(items: [T, number][]): T => {
  let r = Math.random() * items.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[0][0];
};
const places: [{ country: string; region: string | null; city: string | null }, number][] = [
  [{ country: "US", region: "Pennsylvania", city: "Pittsburgh" }, 52], [{ country: "US", region: "Pennsylvania", city: "Philadelphia" }, 8],
  [{ country: "US", region: "Pennsylvania", city: "Harrisburg" }, 3], [{ country: "US", region: "Ohio", city: "Cleveland" }, 5],
  [{ country: "US", region: "New York", city: "New York" }, 7], [{ country: "US", region: "District of Columbia", city: "Washington" }, 4],
  [{ country: "US", region: "Georgia", city: "Atlanta" }, 3], [{ country: "US", region: "Illinois", city: "Chicago" }, 3],
  [{ country: "US", region: "California", city: "Los Angeles" }, 2], [{ country: "CA", region: "Ontario", city: "Toronto" }, 2],
  [{ country: "GB", region: "England", city: "London" }, 2], [{ country: "NG", region: "Lagos", city: "Lagos" }, 1],
  [{ country: "US", region: null, city: null }, 3],
];
const devices: [[string, string, string], number][] = [
  [["mobile", "iOS", "Safari"], 46], [["mobile", "Android", "Chrome"], 28], [["desktop", "Windows", "Chrome"], 9],
  [["desktop", "macOS", "Safari"], 6], [["desktop", "macOS", "Chrome"], 4], [["tablet", "iOS", "Safari"], 4], [["mobile", "iOS", "Instagram"], 3],
];

const codes = await db.select().from(qrCodes);
let total = 0;
for (const code of codes.filter((c: any) => c.mode === "dynamic")) {
  const rows: any[] = [];
  const seen = new Set<string>();
  const weight = 0.4 + Math.random(); // some codes are busier
  for (let day = 29; day >= 0; day--) {
    const n = Math.round((2 + Math.random() * 9) * weight * (day % 7 === 5 ? 2.2 : 1) * (day < 3 ? 1.5 : 1)); // a bump on one weekday
    for (let i = 0; i < n; i++) {
      const at = new Date(Date.now() - day * 86_400_000 - Math.random() * 86_400_000);
      const visitor = `v${Math.floor(Math.random() * 120)}-${at.toISOString().slice(0, 10)}`;
      const [deviceType, os, browser] = pick(devices);
      const bot = Math.random() < 0.04;
      rows.push({
        qrCodeId: code.id, scannedAt: at, visitorHash: visitor, isUnique: !seen.has(visitor), bot, deviceType, os, browser,
        referrer: Math.random() < 0.1 ? "https://www.instagram.com/" : null, ...pick(places),
      });
      seen.add(visitor);
    }
  }
  for (let i = 0; i < rows.length; i += 200) await db.insert(scans).values(rows.slice(i, i + 200));
  total += rows.length;
}
console.log(`inserted ${total} demo scans across ${codes.filter((c: any) => c.mode === "dynamic").length} codes`);
process.exit(0);
