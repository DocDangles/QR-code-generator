// In-memory throttles. Fine for one web service; move to the database if the app ever runs several instances.
const hits = new Map<string, number[]>();

/** Counts this call and reports whether the key is over its limit. */
export function throttled(key: string, max = 5, windowMs = 600_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}

const fails = new Map<string, number[]>();
const FAIL_MAX = 5;
const FAIL_WINDOW = 15 * 60_000;
const recentFails = (key: string, now: number) => (fails.get(key) ?? []).filter((t) => now - t < FAIL_WINDOW);

/** Wrong-password lockout: after 5 failures in 15 minutes the key is locked until the oldest one ages out. */
export const isLocked = (key: string, now = Date.now()) => recentFails(key, now).length >= FAIL_MAX;
export const recordFailure = (key: string, now = Date.now()) => {
  fails.set(key, [...recentFails(key, now), now]);
};
export const clearFailures = (key: string) => {
  fails.delete(key);
};
