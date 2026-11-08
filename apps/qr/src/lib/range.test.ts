import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRange, bucketKeys, startOfLocalDay } from "./range.ts";

const TZ = "America/New_York";
const NOW = new Date("2026-11-08T15:00:00Z"); // DST in New York ended Sunday 2026-11-01

test("30 day default covers 30 local days ending today", () => {
  const r = parseRange({}, TZ, NOW);
  assert.equal(r.key, "30d");
  assert.equal(r.toStr, "2026-11-08");
  assert.equal(r.fromStr, "2026-10-10");
  assert.equal(bucketKeys(r).length, 30);
});
test("local midnight is correct across the DST change", () => {
  assert.equal(startOfLocalDay({ y: 2026, m: 11, d: 1 }, TZ).toISOString(), "2026-11-01T04:00:00.000Z"); // still EDT at midnight
  assert.equal(startOfLocalDay({ y: 2026, m: 11, d: 2 }, TZ).toISOString(), "2026-11-02T05:00:00.000Z"); // EST by the next midnight
});
test("a 25-hour day is one daily bucket, not two", () => {
  const r = parseRange({ from: "2026-10-31", to: "2026-11-02" }, TZ, NOW);
  assert.equal(r.hourly, false);
  assert.deepEqual(bucketKeys(r), ["2026-10-31", "2026-11-01", "2026-11-02"]);
});
test("a single day uses hourly buckets; the fall-back day still has 24 labels", () => {
  const r = parseRange({ from: "2026-11-01", to: "2026-11-01" }, TZ, NOW);
  assert.equal(r.hourly, true);
  assert.equal(r.to.getTime() - r.from.getTime(), 25 * 3_600_000);
  assert.equal(bucketKeys(r).length, 24); // the repeated 1 AM hour shares a label
});
test("this month and last month", () => {
  assert.equal(parseRange({ range: "this-month" }, TZ, NOW).fromStr, "2026-11-01");
  const last = parseRange({ range: "last-month" }, TZ, NOW);
  assert.equal(last.fromStr, "2026-10-01");
  assert.equal(last.toStr, "2026-10-31");
  assert.equal(last.to.toISOString(), "2026-11-01T04:00:00.000Z");
});
test("january rolls back into december", () => {
  const r = parseRange({ range: "last-month" }, TZ, new Date("2027-01-15T12:00:00Z"));
  assert.equal(r.fromStr, "2026-12-01");
  assert.equal(r.toStr, "2026-12-31");
});
test("custom range: swapped dates, invalid dates, and the one-year cap", () => {
  assert.equal(parseRange({ from: "2026-10-20", to: "2026-10-10" }, TZ, NOW).fromStr, "2026-10-10");
  assert.equal(parseRange({ from: "2026-02-31", to: "2026-03-01" }, TZ, NOW).key, "30d"); // invalid date falls back
  const long = parseRange({ from: "2020-01-01", to: "2026-10-01" }, TZ, NOW);
  assert.equal(bucketKeys(long).length, 366);
});
test("a scan late on the 7th local time lands on the 7th", () => {
  const r = parseRange({ from: "2026-11-07", to: "2026-11-07" }, TZ, NOW);
  const lateEvening = new Date("2026-11-08T03:30:00Z"); // 10:30 PM EST on the 7th
  assert.ok(lateEvening >= r.from && lateEvening < r.to);
});
