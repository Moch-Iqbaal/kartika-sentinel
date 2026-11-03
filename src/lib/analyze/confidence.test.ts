import assert from "node:assert/strict";
import test from "node:test";
import { MIN_RELIABLE_CHARS } from "../ingest/short-text.ts";
import { ENGINE_DIVERGENCE } from "../model/divergence.ts";
import { decideConfidence, type ConfidenceInput } from "./confidence.ts";

function input(patch: Partial<ConfidenceInput> = {}): ConfidenceInput {
  return {
    textChars: 400,
    shortText: false,
    indobert: 0.8,
    linear: 0.8,
    matchCount: 1,
    externalCount: 0,
    ...patch,
  };
}

test("tepat 200 karakter dengan mesin sejalan dan padanan adalah tinggi", () => {
  const decision = decideConfidence(input({ textChars: MIN_RELIABLE_CHARS }));
  assert.equal(decision.level, "tinggi");
});

test("satu karakter di bawah ambang panjang memaksa rendah", () => {
  const decision = decideConfidence(input({ textChars: MIN_RELIABLE_CHARS - 1 }));
  assert.equal(decision.level, "rendah");
});

test("selisih mesin tepat pada ambang memaksa rendah", () => {
  const decision = decideConfidence(input({ linear: 0.8 - ENGINE_DIVERGENCE }));
  assert.equal(decision.level, "rendah");
});

test("selisih tepat di bawah ambang tetap tinggi bila ada padanan", () => {
  const decision = decideConfidence(input({ linear: 0.8 - ENGINE_DIVERGENCE + 0.001 }));
  assert.equal(decision.level, "tinggi");
});

test("mesin sejalan tanpa padanan adalah sedang", () => {
  const decision = decideConfidence(input({ matchCount: 0, externalCount: 0 }));
  assert.equal(decision.level, "sedang");
});

test("satu mesin tidak bisa tinggi walau ada padanan", () => {
  const decision = decideConfidence(input({ indobert: null, matchCount: 2 }));
  assert.equal(decision.level, "sedang");
});

test("tanda teks pendek mengalahkan panjang judul", () => {
  const decision = decideConfidence(input({ textChars: 800, shortText: true }));
  assert.equal(decision.level, "rendah");
});

test("probabilitas bukan angka dihitung sebagai mesin yang tidak ada", () => {
  const decision = decideConfidence(input({ indobert: Number.NaN }));
  assert.equal(decision.level, "sedang");
});
