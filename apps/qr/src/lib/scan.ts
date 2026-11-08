import { createHash } from "node:crypto";
import { isbot } from "isbot";
import { UAParser } from "ua-parser-js";

export type ScanInfo = {
  visitorHash: string;
  country: string | null;
  region: string | null;
  city: string | null;
  deviceType: string;
  os: string | null;
  browser: string | null;
  referrer: string | null;
  bot: boolean;
};

/** SHA-256(IP + UA + daily salt). The raw IP is never stored. */
export function visitorHash(ip: string, ua: string, secret: string, day: string): string {
  return createHash("sha256").update(`${ip}|${ua}|${secret}|${day}`).digest("hex");
}

export function clientIp(h: Headers): string {
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}

export function parseScan(h: Headers, secret: string, now = new Date()): ScanInfo {
  const ua = h.get("user-agent") ?? "";
  const p = new UAParser(ua).getResult();
  const type = p.device.type; // mobile | tablet | undefined (desktop)
  const decode = (v: string | null) => (v ? decodeURIComponent(v) : null);
  return {
    visitorHash: visitorHash(clientIp(h), ua, secret, now.toISOString().slice(0, 10)),
    country: h.get("cf-ipcountry"),
    region: decode(h.get("cf-region")),
    city: decode(h.get("cf-ipcity")),
    deviceType: type === "mobile" || type === "tablet" ? type : "desktop",
    os: p.os.name ?? null,
    browser: p.browser.name ?? null,
    referrer: h.get("referer"),
    bot: ua === "" || isbot(ua),
  };
}
