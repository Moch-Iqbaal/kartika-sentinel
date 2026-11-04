import assert from "node:assert/strict";
import test from "node:test";
import { displayRiskFromVerdict, presentDashboardFromAssessment } from "./dashboard.ts";
import type { HoaxAssessment } from "../model/classify.ts";

function assessment(patch: Partial<HoaxAssessment> = {}): HoaxAssessment {
  return {
    probability: 0.1,
    engine: "linear-ngram",
    modelVersion: "test",
    indobert: null,
    linear: { probability: 0.1, version: "t" },
    heuristic: { probability: 0.1, reasons: [] },
    ai: { flagged: false, score: 0, confidence: "rendah", reasons: [], signals: [], disclaimer: "" },
    modelStatus: "dilewati",
    ...patch,
  };
}

test("HOAKS ditampilkan risiko tinggi, FAKTA rendah", () => {
  const hoax = displayRiskFromVerdict("hoax", "Rendah");
  const fakta = displayRiskFromVerdict("not-hoax", "Tinggi");
  assert.ok(hoax.riskScore >= 0.7);
  assert.ok(fakta.riskScore <= 0.2);
  assert.equal(hoax.band, "prioritas");
  assert.equal(fakta.band, "pantau");
});

test("rumor tanpa penguat di dasbor menjadi Kemungkinan HOAKS", () => {
  const shown = presentDashboardFromAssessment({
    text: "Dikabarkan Divpropam memeriksa perwira. Beredar di WA grup, belum membantah.",
    sourceUrl: "https://x.com/liclerc/status/2117550017837928494",
    assessment: assessment({ probability: 0.02, linear: { probability: 0.02, version: "t" } }),
    external: [],
  });
  assert.equal(shown.verdictLabel, "Kemungkinan HOAKS");
  assert.ok(shown.riskScore >= 0.7);
  assert.match(shown.badge.label, /ditinjau/i);
});

test("berita dengan penguat di dasbor menjadi Kemungkinan FAKTA", () => {
  const shown = presentDashboardFromAssessment({
    text: "Eks Kapolri Listyo Sigit Tersangka Penyadapan Prabowo\n\nTEMPO.CO, Jakarta - Bareskrim menetapkan tersangka.",
    sourceUrl: "https://www.tempo.co/politik/listyo",
    assessment: assessment({ probability: 0.3 }),
    external: [{
      source: "CNN Indonesia",
      title: "Polri tetapkan Listyo tersangka",
      url: "https://www.cnnindonesia.com/nasional/listyo",
      rating: null,
      publisher: "CNN Indonesia",
      publishedAt: "2026-11-03",
      similarity: 0.9,
    }],
  });
  assert.equal(shown.verdictLabel, "Kemungkinan FAKTA");
  assert.ok(shown.riskScore < 0.5);
});
