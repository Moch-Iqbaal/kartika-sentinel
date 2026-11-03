import assert from "node:assert/strict";
import test from "node:test";
import {
  BAND_KRITIS_MIN,
  BAND_PRIORITAS_MIN,
  EFFECTIVE_VIRALITY_FLOOR,
  computeRisk,
  effectiveVirality,
  riskBand,
  viralityFromMetrics,
} from "./risk.ts";

test("risiko tetap di antara 0 dan 1", () => {
  const score = computeRisk(0.9, 0.95, 1);
  assert.ok(score > 0.8);
  assert.ok(score <= 1);
  assert.equal(computeRisk(0, 1, 1), 0);
});

test("viralitas nol tidak memaksa risiko menjadi nol", () => {
  const quiet = computeRisk(0.8, 0.9, 0);
  assert.ok(quiet > 0.2);
  assert.equal(effectiveVirality(0), EFFECTIVE_VIRALITY_FLOOR);
  assert.equal(computeRisk(1, 1, 0), EFFECTIVE_VIRALITY_FLOOR);
});

test("pita mengikuti ambang risiko, bukan skor hoaks", () => {
  assert.equal(riskBand(BAND_KRITIS_MIN), "kritis");
  assert.equal(riskBand(BAND_PRIORITAS_MIN), "prioritas");
  assert.equal(riskBand(BAND_PRIORITAS_MIN - 0.001), "pantau");
});

test("jejak sebar menaikkan viralitas", () => {
  const low = viralityFromMetrics([
    { observedAt: "2026-11-02T08:00:00+07:00", likes: 10, shares: 2, comments: 1 },
    { observedAt: "2026-11-02T12:00:00+07:00", likes: 12, shares: 3, comments: 1 },
  ]);
  const high = viralityFromMetrics([
    { observedAt: "2026-11-02T08:00:00+07:00", likes: 400, shares: 80, comments: 30 },
    { observedAt: "2026-11-03T08:00:00+07:00", likes: 12000, shares: 7400, comments: 1600 },
  ]);
  assert.ok(high > low);
});
