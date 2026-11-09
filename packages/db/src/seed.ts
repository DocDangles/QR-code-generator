import { eq } from "drizzle-orm";
import { getDb, clients, qrCodes, users } from "./index.ts";

// One deployment serves one client. Locally (no DATABASE_URL) this seeds Black Equity Coalition with test data.
// Against a real database every setting must be given explicitly, so a new client's deployment can never
// pick up another client's emails or domain by accident.
const prod = !!process.env.DATABASE_URL;
const need = (name: string, local: string) => {
  const v = process.env[name]?.trim();
  if (v) return v;
  if (prod) { console.error(`Missing ${name}. Set it before seeding a real database (see the deploy README).`); process.exit(1); }
  return local;
};

const clientName = need("CLIENT_NAME", "Black Equity Coalition");
const slug = need("CLIENT_SLUG", "bec");
const redirectDomain = need("REDIRECT_DOMAIN", "go.blackequitycoalition.org");
const fallbackUrl = need("FALLBACK_URL", "https://blackequitycoalition.org");
const admin = need("ADMIN_EMAIL", "ebenw2001@gmail.com").toLowerCase();
const notifyEmail = need("NOTIFY_EMAIL", "info@blackequitypgh.org");
const timezone = process.env.TIMEZONE?.trim() || "America/New_York";
const staff = (process.env.CLIENT_STAFF_EMAILS ?? (prod ? "" : "info@blackequitypgh.org")).split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

const db = await getDb();
if ((await db.select().from(clients)).length === 0) {
  await db.insert(clients).values({ name: clientName, slug, timezone, redirectDomain, fallbackUrl, notifyEmail });
} else {
  console.log("client already exists: leaving it as is (change it from the admin page)");
}

if (!prod || process.env.SEED_DEMO === "1") {
  const demo = await db.select().from(qrCodes).where(eq(qrCodes.slug, "demo7"));
  if (demo.length === 0) {
    await db.insert(qrCodes).values({
      mode: "dynamic", slug: "demo7", campaignName: "Seed test code",
      destinationUrl: fallbackUrl, utmSource: "qr", utmMedium: "print", utmCampaign: "seed-test",
    });
  }
}

for (const [email, role] of [[admin, "admin"], ...staff.map((e) => [e, "client_editor"])] as const) {
  if ((await db.select().from(users).where(eq(users.email, email))).length === 0) await db.insert(users).values({ email, role });
}
console.log("seeded");
process.exit(0);
