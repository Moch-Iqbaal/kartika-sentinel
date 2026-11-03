import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCountToken,
  parseEngagement,
  viralityFromEngagement,
} from "./engagement-parse.ts";
import { VIRALITY_ENGAGEMENT_CEILING } from "./risk.ts";

test("parseCountToken membaca K/M/rb/jt dan pemisah ribuan", () => {
  assert.equal(parseCountToken("77.9K"), 77_900);
  assert.equal(parseCountToken("77,9k"), 77_900);
  assert.equal(parseCountToken("1.2M"), 1_200_000);
  assert.equal(parseCountToken("12rb"), 12_000);
  assert.equal(parseCountToken("1,5jt"), 1_500_000);
  assert.equal(parseCountToken("12345"), 12_345);
  assert.equal(parseCountToken("12.345"), 12_345);
  assert.equal(parseCountToken("12,345"), 12_345);
  assert.equal(parseCountToken(""), null);
  assert.equal(parseCountToken("abc"), null);
});

test("parseEngagement membaca Views ala X/Twitter dari teks kasus", () => {
  const sample = "Rumor Polri · 77.9K Views 38 · belum ada konfirmasi resmi";
  const parsed = parseEngagement(sample);
  assert.equal(parsed.found, true);
  assert.equal(parsed.views, 77_900);
  assert.match(parsed.plainLabel ?? "", /77\.900/);
  assert.match(parsed.plainLabel ?? "", /dilihat/i);
});

test("parseEngagement membaca beberapa format platform", () => {
  assert.equal(parseEngagement("Video ini 143.9K Views di linimasa").views, 143_900);
  assert.equal(parseEngagement("Ditonton 2,3jt kali di TikTok").views, 2_300_000);
  assert.equal(parseEngagement("YouTube: 1.2M views · 40K likes").views, 1_200_000);
  assert.equal(parseEngagement("YouTube: 1.2M views · 40K likes").likes, 40_000);
  assert.equal(parseEngagement("500 reposts dan 120 suka").shares, 500);
  assert.equal(parseEngagement("500 reposts dan 120 suka").likes, 120);
  assert.equal(parseEngagement("8.5K retweets").shares, 8_500);
  assert.equal(parseEngagement("tayangan: 9900").views, 9_900);
  assert.equal(parseEngagement("dilihat 15rb orang").views, 15_000);
  assert.equal(parseEngagement("komentar 320").comments, 320);
});

test("tanpa angka sebaran, found false dan viralitas 0", () => {
  const empty = parseEngagement("Berita biasa tanpa metrik sosial.");
  assert.equal(empty.found, false);
  assert.equal(viralityFromEngagement(empty), 0);
});

test("viralitas views memakai langit Metricool 20.000 secara log", () => {
  const parsed = parseEngagement("77.9K Views");
  const score = viralityFromEngagement(parsed);
  const expected = Math.log1p(77_900) / Math.log1p(VIRALITY_ENGAGEMENT_CEILING);
  assert.ok(score > 0.9);
  assert.ok(Math.abs(score - Math.min(1, expected)) < 1e-9);
  // Di atas langit → tetap 1
  assert.equal(viralityFromEngagement(parseEngagement("5M views")), 1);
});
