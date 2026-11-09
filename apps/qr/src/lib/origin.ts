/** Blocks cross-site form posts (cookies are also SameSite=Lax). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients (curl) don't send one
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}
