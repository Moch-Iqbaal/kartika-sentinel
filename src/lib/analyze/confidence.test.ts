import assert from "node:assert/strict";
import test from "node:test";
import { MIN_RELIABLE_CHARS } from "../ingest/short-text.ts";
import { decideConfidence, type ConfidenceInput } from "./confidence.ts";

function input(patch: Partial<ConfidenceInput> = {}): ConfidenceInput {
  return {
    textChars: 400,
    shortText: false,
    indobert: 0.8,
    linear: 0.8,
    matchCount: 0,
    externalCount: 0,
    ...patch,
  };
}

test("dua media penguat = tinggi", () => {
  const decision = decideConfidence(input({ outletCount: 2 }));
  assert.equal(decision.level, "tinggi");
});

test("padanan pemeriksaan fakta = tinggi", () => {
  const decision = decideConfidence(input({ factCheckMatch: true }));
  assert.equal(decision.level, "tinggi");
});

test("satu media penguat = sedang", () => {
  const decision = decideConfidence(input({ outletCount: 1 }));
  assert.equal(decision.level, "sedang");
});

test("HOAKS tanpa penguat = rendah", () => {
  const decision = decideConfidence(input({ hoaxFromNoCorroboration: true }));
  assert.equal(decision.level, "rendah");
  assert.match(decision.because, /belum ada media lain/);
});

test("teks pendek memaksa rendah", () => {
  const decision = decideConfidence(input({ textChars: MIN_RELIABLE_CHARS - 1, outletCount: 2 }));
  assert.equal(decision.level, "rendah");
});

test("tanda teks pendek mengalahkan panjang judul", () => {
  const decision = decideConfidence(input({ textChars: 800, shortText: true, outletCount: 2 }));
  assert.equal(decision.level, "rendah");
});
