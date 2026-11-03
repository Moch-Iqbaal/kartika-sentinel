import assert from "node:assert/strict";
import test from "node:test";
import { bearerSecret, classifyUrl, heartbeatFresh, HEARTBEAT_STALE_MS, secretsMatch } from "./register.ts";

test("heartbeat segar di bawah 90 detik dan mati sesudahnya", () => {
  const now = 1_000_000;
  assert.equal(heartbeatFresh(now - 30_000, now), true);
  assert.equal(heartbeatFresh(now - HEARTBEAT_STALE_MS, now), true);
  assert.equal(heartbeatFresh(now - HEARTBEAT_STALE_MS - 1, now), false);
  assert.equal(heartbeatFresh(now + 1000, now), false);
});

test("rahasia beda panjang tidak lolos", () => {
  assert.equal(secretsMatch("aaaa", "aaaa"), true);
  assert.equal(secretsMatch("aaaa", "aaab"), false);
  assert.equal(secretsMatch("aaaa", "aaa"), false);
  assert.equal(secretsMatch("", "aaaa"), false);
});

test("URL classify hanya https dan menolak host lokal", () => {
  assert.equal(classifyUrl("https://abc.trycloudflare.com")?.pathname, "/classify");
  assert.equal(classifyUrl("https://abc.trycloudflare.com/classify")?.href, "https://abc.trycloudflare.com/classify");
  assert.equal(classifyUrl("http://abc.trycloudflare.com/classify"), null);
  assert.equal(classifyUrl("https://localhost/classify"), null);
  assert.equal(classifyUrl("https://metadata.google.internal/classify"), null);
});

test("bearer diambil dari header", () => {
  assert.equal(bearerSecret("Bearer rahasia"), "rahasia");
  assert.equal(bearerSecret("bearer rahasia"), "rahasia");
  assert.equal(bearerSecret("Basic rahasia"), "");
});
