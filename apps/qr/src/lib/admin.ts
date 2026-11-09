import { isIP } from "node:net";

export type ClientSettings = {
  name: string; timezone: string; redirectDomain: string; fallbackUrl: string;
  notifyEmail: string | null; brandColors: string[]; logoUrl: string | null;
};

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

export const isEmail = (v: string) => v.length <= 254 && EMAIL.test(v);

export function validTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

/** Validates untrusted client-settings JSON. Throws Error(message) for the person editing. */
export function parseClientSettings(b: any): ClientSettings {
  const name = String(b?.name ?? "").trim();
  if (!name || name.length > 120) throw new Error("Organization name is required (120 characters max)");
  const timezone = String(b?.timezone ?? "").trim();
  if (!validTimezone(timezone)) throw new Error("Time zone isn't recognized. Use a name like America/New_York");
  const redirectDomain = String(b?.redirectDomain ?? "").trim().toLowerCase();
  if (!HOSTNAME.test(redirectDomain)) throw new Error("Redirect domain must be a hostname like go.example.org, with no https:// or path");
  let fallbackUrl: string;
  try {
    const u = new URL(String(b?.fallbackUrl ?? "").trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    fallbackUrl = u.toString();
  } catch { throw new Error("Fallback URL must be a full web address starting with https://"); }
  const notifyEmail = String(b?.notifyEmail ?? "").trim().toLowerCase();
  if (notifyEmail && !isEmail(notifyEmail)) throw new Error("Notification email isn't a valid address");
  const brandColors = (Array.isArray(b?.brandColors) ? b.brandColors : []).map((c: unknown) => String(c).trim()).filter(Boolean);
  if (brandColors.length > 3 || brandColors.some((c: string) => !HEX.test(c))) throw new Error("Brand colors must be up to three hex colors like #7a1f2b");
  const logoUrl = String(b?.logoUrl ?? "").trim();
  if (logoUrl && !/^https:\/\/\S+$/.test(logoUrl)) throw new Error("Logo URL must start with https://");
  return { name, timezone, redirectDomain, fallbackUrl, notifyEmail: notifyEmail || null, brandColors, logoUrl: logoUrl || null };
}

/** True for addresses that must never be fetched from the server: loopback, private, link-local, unspecified. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x.startsWith("::ffff:")) return isPrivateAddress(x.slice(7));
    return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb");
  }
  return true; // not an IP at all: treat as unsafe
}
