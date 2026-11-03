import assert from "node:assert/strict";
import test from "node:test";
import { parseContentDate } from "./dates.ts";
import {
  NEAR_SAME_SIMILARITY,
  RECENCY_FRESH_DAYS,
  RECENCY_FRESH_WEIGHT,
  RECENCY_OLD_DAYS,
  RECENCY_OLD_WEIGHT,
  RECENCY_UNKNOWN_WEIGHT,
  ageInDays,
  ageWords,
  countsAsPrimary,
  isOldEvidence,
  plainWhen,
  recencyScore,
  recencyWeight,
} from "./recency.ts";

const NOW = new Date("2026-11-03T12:00:00+07:00");

test("bobot umur: penuh 30 hari, 0,15 sesudah 183 hari, 0,4 tanpa tanggal", () => {
  assert.equal(RECENCY_FRESH_DAYS, 30);
  assert.equal(RECENCY_OLD_DAYS, 183);
  assert.equal(recencyWeight(0), RECENCY_FRESH_WEIGHT);
  assert.equal(recencyWeight(30), 1);
  assert.equal(recencyWeight(183), RECENCY_OLD_WEIGHT);
  assert.equal(recencyWeight(400), 0.15);
  assert.equal(recencyWeight(null), RECENCY_UNKNOWN_WEIGHT);
  const midpoint = RECENCY_FRESH_DAYS + (RECENCY_OLD_DAYS - RECENCY_FRESH_DAYS) / 2;
  assert.equal(midpoint, 106.5);
  assert.ok(Math.abs(recencyWeight(midpoint) - 0.575) < 1e-12);
  const day31 = 1 - ((31 - 30) / (183 - 30)) * (1 - 0.15);
  assert.ok(Math.abs(recencyWeight(31) - day31) < 1e-12);
});

test("nilai urut adalah kemiripan kali bobot", () => {
  assert.equal(recencyScore(0.5, "2026-11-03", NOW), 0.5);
  assert.equal(recencyScore(1, "2026-10-04", NOW), 1);
  assert.ok(Math.abs(recencyScore(1, "2024-01-01", NOW) - 0.15) < 1e-12);
  assert.equal(recencyScore(0.5, null, NOW), 0.2);
  assert.equal(recencyScore(2, "2026-11-03", NOW), 1);
});

test("umur ditulis dengan kata, dan dibanding tanggal berita bila ada", () => {
  assert.equal(ageInDays("2026-10-31", NOW), 3);
  assert.equal(ageWords(3), "3 hari lalu");
  assert.equal(ageWords(1), "1 hari lalu");
  assert.equal(ageWords(0), "hari ini");
  assert.match(plainWhen("2026-10-31", null, NOW) ?? "", /3 hari lalu/);
  assert.match(plainWhen("2026-10-31", "2026-11-03", NOW) ?? "", /3 hari lebih tua dari berita ini/);
  assert.match(plainWhen("2024-01-01", "2026-11-03", NOW) ?? "", /lebih tua dari berita ini/);
  assert.equal(isOldEvidence("2024-01-01", "2026-11-03", NOW), true);
  assert.equal(isOldEvidence("2024-01-15", "2024-02-01", NOW), false);
  assert.equal(countsAsPrimary(0.5, "2024-01-01", "2026-11-03", NOW), false);
  assert.equal(countsAsPrimary(NEAR_SAME_SIMILARITY, "2024-01-01", "2026-11-03", NOW), true);
  assert.equal(countsAsPrimary(NEAR_SAME_SIMILARITY - 0.01, "2024-01-01", "2026-11-03", NOW), false);
});

test("tanggal isi dibaca dari YouTube dan dari artikel, tanpa mengarang", () => {
  assert.equal(parseContentDate(`"publishDate":"2026-10-31T10:00:00+07:00"`), "2026-10-31");
  assert.equal(
    parseContentDate(`<meta property="article:published_time" content="2026-05-02T08:00:00+07:00">`),
    "2026-05-02",
  );
  assert.equal(parseContentDate("<html><title>Tanpa tanggal</title></html>"), null);
});
