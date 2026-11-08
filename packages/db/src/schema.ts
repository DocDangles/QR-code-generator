import {
  pgTable, uuid, text, timestamp, boolean, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * One deployment serves one client (Q2: separate deployment per client),
 * so `clients` holds a single settings row. Keeping it a table keeps the
 * schema compatible with other E Suite apps.
 */
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("America/New_York"),
  redirectDomain: text("redirect_domain").notNull(),
  fallbackUrl: text("fallback_url").notNull(),
  notifyEmail: text("notify_email"),
  brandColors: jsonb("brand_colors").$type<string[]>().default([]),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: text("role", { enum: ["admin", "client_editor", "client_viewer"] }).notNull().default("client_viewer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const qrCodes = pgTable(
  "qr_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // static: the destination is encoded directly in the image; no tracking, never editable.
    // dynamic: the image holds a short link; destination editable, scans tracked.
    mode: text("mode", { enum: ["static", "dynamic"] }).notNull().default("dynamic"),
    slug: text("slug"), // dynamic only; what is printed. Never reused.
    campaignName: text("campaign_name").notNull(),
    type: text("type", { enum: ["url", "vcard", "wifi", "text"] }).notNull().default("url"),
    destinationUrl: text("destination_url").notNull(),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    utmTerm: text("utm_term"),
    status: text("status", { enum: ["active", "paused", "expired"] }).notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    expireRedirectUrl: text("expire_redirect_url"),
    passwordHash: text("password_hash"),
    notifyRules: jsonb("notify_rules").$type<Record<string, unknown>>().default({}),
    templateId: uuid("template_id"),
    style: jsonb("style").$type<Record<string, unknown>>().default({}),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("qr_codes_slug_idx").on(t.slug)],
);

/** Saved QR designs (patterns, eyes, frames, colors, logo) reusable across codes. */
export const qrTemplates = pgTable("qr_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  style: jsonb("style").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const destinationHistory = pgTable("destination_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  qrCodeId: uuid("qr_code_id").notNull().references(() => qrCodes.id),
  oldUrl: text("old_url").notNull(),
  newUrl: text("new_url").notNull(),
  changedBy: uuid("changed_by"),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scans = pgTable(
  "scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    qrCodeId: uuid("qr_code_id").notNull().references(() => qrCodes.id),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
    visitorHash: text("visitor_hash").notNull(), // salted daily hash; no raw IP stored
    isUnique: boolean("is_unique").notNull().default(false),
    status: text("status").notNull().default("ok"), // ok | expired | paused
    country: text("country"),
    region: text("region"),
    city: text("city"),
    deviceType: text("device_type"),
    os: text("os"),
    browser: text("browser"),
    referrer: text("referrer"),
    bot: boolean("bot").notNull().default(false),
  },
  (t) => [index("scans_code_time_idx").on(t.qrCodeId, t.scannedAt)],
);
