import { randomBytes, scrypt, timingSafeEqual, createHash, createHmac } from "node:crypto";

// scrypt ships with Node (memory-hard, no native build step), so it works the same on Railway as on a laptop.
const N = 16384, R = 8, P = 1, KEYLEN = 64;
const derive = (pw: string, salt: Buffer, n: number, r: number, p: number) =>
  new Promise<Buffer>((res, rej) => scrypt(pw, salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));

export function validatePassword(pw: unknown): string {
  if (typeof pw !== "string" || pw.length < 8) throw new Error("Password must be at least 8 characters");
  if (pw.length > 200) throw new Error("Password is too long");
  return pw;
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(pw, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, key] = stored.split("$");
  if (alg !== "scrypt" || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await derive(pw, Buffer.from(salt, "base64"), +n, +r, +p);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// --- unlock cookie: proves the visitor already entered this code's password in the last 24 hours ---
const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required in production");
  return s ?? "dev-only-session-secret";
};
const sig = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url");
/** Tied to the current password hash, so changing the password locks everyone out again. */
const fingerprint = (passwordHash: string) => createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
export const UNLOCK_TTL_S = 24 * 3600;
export const unlockCookieName = (slug: string) => `es_u_${slug}`;

export function makeUnlockToken(slug: string, passwordHash: string, now = Date.now()): string {
  const exp = now + UNLOCK_TTL_S * 1000;
  const body = `${exp}.${fingerprint(passwordHash)}`;
  return `${body}.${sig(`${slug}.${body}`)}`;
}

export function checkUnlockToken(token: string | undefined, slug: string, passwordHash: string, now = Date.now()): boolean {
  if (!token) return false;
  const [exp, fp, mac] = token.split(".");
  if (!exp || !fp || !mac || Number(exp) < now || fp !== fingerprint(passwordHash)) return false;
  const a = Buffer.from(mac), b = Buffer.from(sig(`${slug}.${exp}.${fp}`));
  return a.length === b.length && timingSafeEqual(a, b);
}
