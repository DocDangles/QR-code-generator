import { eq } from "drizzle-orm";
import { getDb, clients, qrCodes, users } from "./index.ts";

const db = await getDb();
const existing = await db.select().from(clients).where(eq(clients.slug, "bec"));
if (existing.length === 0) {
  await db.insert(clients).values({
    name: "Black Equity Coalition",
    slug: "bec",
    timezone: "America/New_York",
    redirectDomain: process.env.REDIRECT_DOMAIN ?? "go.blackequitycoalition.org",
    fallbackUrl: process.env.FALLBACK_URL ?? "https://blackequitycoalition.org",
    notifyEmail: "info@blackequitypgh.org",
  });
}
const demo = await db.select().from(qrCodes).where(eq(qrCodes.slug, "demo7"));
if (demo.length === 0) {
  await db.insert(qrCodes).values({
    mode: "dynamic",
    slug: "demo7",
    campaignName: "Seed test code",
    destinationUrl: "https://blackequitycoalition.org/resources?ref=seed#top",
    utmSource: "qr",
    utmMedium: "print",
    utmCampaign: "seed-test",
  });
}
const admin = (process.env.ADMIN_EMAIL ?? "ebenw2001@gmail.com").toLowerCase();
const staff = (process.env.CLIENT_STAFF_EMAILS ?? "info@blackequitypgh.org").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
for (const [email, role] of [[admin, "admin"], ...staff.map((e) => [e, "client_editor"])] as const) {
  const have = await db.select().from(users).where(eq(users.email, email));
  if (have.length === 0) await db.insert(users).values({ email, role });
}
console.log("seeded");
process.exit(0);
