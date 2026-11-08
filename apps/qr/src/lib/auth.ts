import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, users, loginTokens } from "@e-suite/db";

export type Role = "admin" | "client_editor" | "client_viewer";
export type SessionUser = { id: string; email: string; name: string | null; role: Role };

const COOKIE = "es_session";
const SESSION_DAYS = 14;
const TOKEN_MINUTES = 15;
const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required in production");
  return s ?? "dev-only-session-secret";
};
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url");

export function baseUrl(req?: Request): string {
  return process.env.APP_URL ?? (req ? new URL(req.url).origin : "http://localhost:3000");
}

/** Blocks cross-site form posts (cookies are also SameSite=Lax). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients (curl) and same-origin GET-less posts
  try { return new URL(origin).host === req.headers.get("host"); } catch { return false; }
}

// Light in-memory throttle: 5 link requests per address per 10 minutes.
const hits = new Map<string, number[]>();
export function throttled(key: string, max = 5, windowMs = 600_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}

/** Creates a single-use link for a known user. Returns null for unknown emails (caller must not reveal that). */
export async function createMagicLink(email: string, base: string): Promise<string | null> {
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (!user) return null;
  const token = randomBytes(32).toString("base64url");
  await db.insert(loginTokens).values({
    tokenHash: sha(token), email: user.email, expiresAt: new Date(Date.now() + TOKEN_MINUTES * 60_000),
  });
  return `${base}/auth/verify?token=${token}`;
}

export async function sendMagicLink(email: string, link: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.log(`[dev] magic link for ${email}: ${link}`); return; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? "E Suite <onboarding@resend.dev>", to: [email],
      subject: "Your sign-in link",
      text: `Sign in to E Suite QR:\n\n${link}\n\nThis link works once and expires in ${TOKEN_MINUTES} minutes.`,
    }),
  });
  if (!res.ok) console.error("magic link email failed", res.status);
}

/** Consumes a token (once) and returns the user, or null. */
export async function consumeToken(token: string): Promise<SessionUser | null> {
  const db = await getDb();
  const [row] = await db.update(loginTokens).set({ usedAt: new Date() })
    .where(and(eq(loginTokens.tokenHash, sha(token)), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, new Date())))
    .returning();
  if (!row) return null;
  const [u] = await db.select().from(users).where(eq(users.email, row.email));
  return u ? { id: u.id, email: u.email, name: u.name, role: u.role } : null;
}

export function sessionCookie(userId: string) {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const body = Buffer.from(JSON.stringify({ uid: userId, exp })).toString("base64url");
  return {
    name: COOKIE, value: `${body}.${sign(body)}`,
    options: { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 86_400 },
  };
}
export const clearedCookie = () => ({ name: COOKIE, value: "", options: { path: "/", maxAge: 0 } });

export async function getSession(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof uid !== "string" || exp < Date.now()) return null;
    const db = await getDb();
    const [u] = await db.select().from(users).where(eq(users.id, uid));
    return u ? { id: u.id, email: u.email, name: u.name, role: u.role } : null;
  } catch { return null; }
}

export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const u = await getSession();
  if (!u) redirect("/login");
  if (roles && !roles.includes(u.role)) redirect("/dashboard?denied=1");
  return u;
}
export const canEdit = (u: SessionUser) => u.role === "admin" || u.role === "client_editor";

/** For route handlers: returns the user if signed in with an allowed role, else null (caller sends 401/403). */
export async function apiUser(roles?: Role[]): Promise<SessionUser | null> {
  const u = await getSession();
  return u && (!roles || roles.includes(u.role)) ? u : null;
}
