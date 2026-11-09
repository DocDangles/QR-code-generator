import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClientSettings, isPrivateAddress, isEmail } from "./admin.ts";

const good = { name: "Black Equity Coalition", timezone: "America/New_York", redirectDomain: "Go.BlackEquityCoalition.org", fallbackUrl: "https://blackequitycoalition.org", notifyEmail: "Info@BlackEquityPGH.org", brandColors: ["#7a1f2b"], logoUrl: "" };

test("valid settings are normalized", () => {
  const s = parseClientSettings(good);
  assert.equal(s.redirectDomain, "go.blackequitycoalition.org");
  assert.equal(s.notifyEmail, "info@blackequitypgh.org");
  assert.equal(s.logoUrl, null);
  assert.equal(s.fallbackUrl, "https://blackequitycoalition.org/");
});

test("bad settings are refused with a plain message", () => {
  const bad = (o: object, re: RegExp) => assert.throws(() => parseClientSettings({ ...good, ...o }), re);
  bad({ name: "  " }, /name is required/);
  bad({ timezone: "Mars/Olympus" }, /Time zone/);
  bad({ redirectDomain: "https://go.example.org" }, /hostname/);
  bad({ redirectDomain: "go.example.org/path" }, /hostname/);
  bad({ redirectDomain: "localhost" }, /hostname/);
  bad({ redirectDomain: "127.0.0.1" }, /hostname/);
  bad({ fallbackUrl: "javascript:alert(1)" }, /Fallback URL/);
  bad({ fallbackUrl: "example.org" }, /Fallback URL/);
  bad({ notifyEmail: "not-an-email" }, /email/);
  bad({ brandColors: ["red"] }, /hex/);
  bad({ brandColors: ["#111111", "#222222", "#333333", "#444444"] }, /three/);
  bad({ logoUrl: "http://insecure.example/logo.png" }, /https/);
});

test("empty notification email is allowed (notifications simply stay off)", () => {
  assert.equal(parseClientSettings({ ...good, notifyEmail: "" }).notifyEmail, null);
});

test("private, loopback and link-local addresses are never fetched", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.1", "172.31.255.255", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "::", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip"]) {
    assert.ok(isPrivateAddress(ip), ip);
  }
  for (const ip of ["8.8.8.8", "104.18.0.1", "172.32.0.1", "2606:4700::1111"]) assert.ok(!isPrivateAddress(ip), ip);
});

test("email check", () => {
  assert.ok(isEmail("a@b.co"));
  assert.ok(!isEmail("a b@c.org"));
  assert.ok(!isEmail("nope"));
});
