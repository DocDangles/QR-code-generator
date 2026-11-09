import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, validatePassword, makeUnlockToken, checkUnlockToken } from "./password.ts";
import { isLocked, recordFailure, clearFailures } from "./throttle.ts";

test("hash verifies the right password only, and salts differ", async () => {
  const h1 = await hashPassword("correct horse"), h2 = await hashPassword("correct horse");
  assert.notEqual(h1, h2);
  assert.ok(await verifyPassword("correct horse", h1));
  assert.ok(!(await verifyPassword("correct horsf", h1)));
  assert.ok(!(await verifyPassword("x", "garbage")));
  assert.ok(!h1.includes("correct"));
});

test("password rules", () => {
  assert.throws(() => validatePassword("short"));
  assert.throws(() => validatePassword(undefined));
  assert.equal(validatePassword("long enough!"), "long enough!");
});

test("unlock token: valid, expired, wrong slug, changed password, tampered", async () => {
  const hash = await hashPassword("pw-12345678"), now = Date.now();
  const t = makeUnlockToken("abc234", hash, now);
  assert.ok(checkUnlockToken(t, "abc234", hash, now + 1000));
  assert.ok(!checkUnlockToken(t, "abc234", hash, now + 25 * 3600_000), "expires after 24h");
  assert.ok(!checkUnlockToken(t, "zzz999", hash, now), "bound to its slug");
  assert.ok(!checkUnlockToken(t, "abc234", await hashPassword("pw-12345678"), now), "invalid once the password changes");
  assert.ok(!checkUnlockToken(t.slice(0, -2) + "xx", "abc234", hash, now));
  assert.ok(!checkUnlockToken(undefined, "abc234", hash, now));
});

test("lockout after 5 wrong attempts, clears on success, ages out after 15 min", () => {
  const k = "v:abc234", t0 = 1_000_000;
  for (let i = 0; i < 4; i++) recordFailure(k, t0 + i);
  assert.ok(!isLocked(k, t0 + 10));
  recordFailure(k, t0 + 5);
  assert.ok(isLocked(k, t0 + 10));
  assert.ok(!isLocked(k, t0 + 16 * 60_000));
  clearFailures(k);
  assert.ok(!isLocked(k, t0 + 10));
});
