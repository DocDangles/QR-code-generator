import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDestination, resolveState, isValidSlug } from "./redirect.ts";
import { parseScan } from "./scan.ts";

test("adds UTMs and keeps fragment + existing query", () => {
  const out = buildDestination("https://x.org/p?a=1#top", { source: "qr", medium: "print", campaign: "c1" });
  const u = new URL(out);
  assert.equal(u.searchParams.get("a"), "1");
  assert.equal(u.searchParams.get("utm_source"), "qr");
  assert.equal(u.searchParams.get("utm_campaign"), "c1");
  assert.equal(u.hash, "#top");
});
test("does not overwrite UTMs already in the destination", () => {
  const out = buildDestination("https://x.org/?utm_source=email", { source: "qr" });
  assert.equal(new URL(out).searchParams.get("utm_source"), "email");
});
test("skips empty UTMs", () => {
  assert.equal(buildDestination("https://x.org/", { source: null, medium: "" }), "https://x.org/");
});
test("paused / expired states", () => {
  assert.equal(resolveState({ status: "paused", expiresAt: null }), "paused");
  assert.equal(resolveState({ status: "active", expiresAt: new Date(Date.now() - 1000) }), "expired");
  assert.equal(resolveState({ status: "active", expiresAt: null }), "ok");
});
test("slug validation", () => {
  assert.ok(isValidSlug("abc23"));
  assert.ok(!isValidSlug("../etc"));
  assert.ok(!isValidSlug("AB"));
});
test("bot + device parsing, no raw IP in hash", () => {
  const bot = parseScan(new Headers({ "user-agent": "Slackbot-LinkExpanding 1.0" }), "s");
  assert.equal(bot.bot, true);
  const phone = parseScan(new Headers({
    "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    "cf-connecting-ip": "203.0.113.9", "cf-ipcountry": "US", "cf-ipcity": "Pittsburgh",
  }), "s");
  assert.equal(phone.bot, false);
  assert.equal(phone.deviceType, "mobile");
  assert.equal(phone.city, "Pittsburgh");
  assert.ok(!phone.visitorHash.includes("203.0.113.9"));
});
