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

/**
 * Whether cookies get the Secure flag. Follows the address the app is served on (APP_URL), so a production
 * build tested over plain http://localhost still works; with APP_URL unset, production defaults to secure.
 */
export const secureCookies = () => (process.env.APP_URL ? process.env.APP_URL.startsWith("https://") : process.env.NODE_ENV === "production");
