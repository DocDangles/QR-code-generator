import { randomInt } from "node:crypto";
import { SLUG_ALPHABET } from "./redirect";
import { buildDestination, redirectBase } from "./redirect";
import { normalizeStyle, type QrStyle } from "./qr/style";
import { parseRules, type NotifyRules } from "./notify";
import { endOfLocalDate } from "./range";

export type CodeInput = {
  mode: "static" | "dynamic";
  campaignName: string;
  destinationUrl: string;
  utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null; utmTerm: string | null;
  status: "active" | "paused";
  expiresAt: Date | null;
  expireRedirectUrl: string | null;
  style: QrStyle;
  notifyRules: NotifyRules;
};

export function generateSlug(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) s += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];
  return s;
}

const httpUrl = (v: unknown, field: string): string => {
  let u: URL;
  try { u = new URL(String(v ?? "").trim()); } catch { throw new Error(`${field} must be a full URL starting with https://`); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`${field} must start with http:// or https://`);
  if (u.toString().length > 2048) throw new Error(`${field} is too long`);
  return u.toString();
};
const opt = (v: unknown, max = 100): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > max) throw new Error("A UTM value is too long");
  return s || null;
};

/** Validates an untrusted create/update body. Throws Error(message) for the user. */
export function parseCodeInput(body: any, tz = "America/New_York"): CodeInput {
  const campaignName = String(body?.campaignName ?? "").trim();
  if (!campaignName || campaignName.length > 120) throw new Error("Campaign name is required (120 characters max)");
  const mode = body?.mode === "static" ? "static" : "dynamic";
  const rawExpiry = typeof body?.expiresAt === "string" ? body.expiresAt.trim() : "";
  const expiresAt = rawExpiry ? (/^\d{4}-\d{2}-\d{2}$/.test(rawExpiry) ? endOfLocalDate(rawExpiry, tz) : new Date(rawExpiry)) : null;
  if (rawExpiry && (!expiresAt || Number.isNaN(expiresAt.getTime()))) throw new Error("Expiry date is not valid");
  return {
    mode, campaignName,
    destinationUrl: httpUrl(body?.destinationUrl, "Destination"),
    utmSource: opt(body?.utmSource), utmMedium: opt(body?.utmMedium), utmCampaign: opt(body?.utmCampaign),
    utmContent: opt(body?.utmContent), utmTerm: opt(body?.utmTerm),
    status: body?.status === "paused" ? "paused" : "active",
    expiresAt: mode === "dynamic" ? expiresAt : null,
    expireRedirectUrl: body?.expireRedirectUrl ? httpUrl(body.expireRedirectUrl, "Expired-code URL") : null,
    style: normalizeStyle(body?.style),
    notifyRules: mode === "dynamic" ? parseRules(body?.notifyRules) : parseRules(null),
  };
}

type Target = { mode: string; slug: string | null; destinationUrl: string; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null; utmTerm: string | null };

export { redirectBase };

/** What is actually encoded in the QR image. Static: the destination itself (UTMs baked in once). Dynamic: the short link. */
export function qrTarget(c: Target, redirectDomain: string): string {
  if (c.mode === "static") {
    return buildDestination(c.destinationUrl, { source: c.utmSource, medium: c.utmMedium, campaign: c.utmCampaign, content: c.utmContent, term: c.utmTerm });
  }
  return `${redirectBase(redirectDomain)}/${c.slug}`;
}

export function clearSlugCache(slug: string | null) {
  const g = globalThis as unknown as { __codeCache?: Map<string, unknown> };
  if (slug) g.__codeCache?.delete(slug);
}
