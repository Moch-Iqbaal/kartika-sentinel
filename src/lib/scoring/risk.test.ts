import assert from "node:assert/strict";
import test from "node:test";
import { computeRisk, viralityFromMetrics } from "./risk.ts";

test("risiko tetap di antara 0 dan 1", () => {
  const score = computeRisk(0.9, 0.95, 1);
  assert.ok(score > 0.8);
  assert.ok(score <= 1);
  assert.equal(computeRisk(0, 1, 1), 0);
});

test("viralitas nol tidak memaksa risiko menjadi nol", () => {
  const quiet = computeRisk(0.8, 0.9, 0);
  assert.ok(quiet > 0.2);
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
