const UTM_KEYS = ["source", "medium", "campaign", "content", "term"] as const;
export type Utms = Partial<Record<(typeof UTM_KEYS)[number], string | null>>;

/**
 * Append UTM params to a destination at redirect time (never baked into the QR).
 * Keeps the existing query string and #fragment; never overwrites UTMs the
 * destination already carries.
 */
export function buildDestination(destination: string, utms: Utms): string {
  const url = new URL(destination);
  for (const k of UTM_KEYS) {
    const v = utms[k];
    if (v && !url.searchParams.has(`utm_${k}`)) url.searchParams.set(`utm_${k}`, v);
  }
  return url.toString();
}

export type CodeState = {
  status: "active" | "paused" | "expired";
  expiresAt: Date | null;
};

/** What a request for this code should do right now. */
export function resolveState(code: CodeState, now = new Date()): "ok" | "paused" | "expired" {
  if (code.status === "paused") return "paused";
  if (code.status === "expired") return "expired";
  if (code.expiresAt && code.expiresAt.getTime() <= now.getTime()) return "expired";
  return "ok";
}

/** Slugs: lowercase letters/digits, no look-alikes (0/o, 1/l). */
export const SLUG_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz";
export function isValidSlug(s: string): boolean {
  return /^[a-z0-9]{3,12}$/.test(s);
}

/** Public base URL printed on codes: the client's branded redirect domain (or an override for local testing). */
export const redirectBase = (redirectDomain: string) => process.env.PUBLIC_REDIRECT_BASE ?? `https://${redirectDomain}`;
