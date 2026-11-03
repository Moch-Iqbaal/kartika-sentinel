import assert from "node:assert/strict";
import test from "node:test";
import { loadEvaluation, metricsFromCounts } from "./report.ts";

test("laporan linier cocok dengan matriks dan tidak menumpuk data latih", () => {
  const report = loadEvaluation();
  assert.equal(report.split.indexOverlap, 0);
  assert.equal(report.split.droppedTrainText, 24);
  assert.equal(report.split.holdoutN, 752);
  assert.equal(report.split.evaluatedN, 728);
  assert.deepEqual(report.linear.confusion, { tp: 451, fp: 57, fn: 133, tn: 87 });
  const metrics = metricsFromCounts(report.linear.confusion!);
  assert.equal(metrics.n, 728);
  assert.equal(report.indobert.ran, false);
  assert.match(report.indobert.note, /tidak dijalankan/i);
  assert.equal(report.linear.falsePositives?.length, 5);
  assert.equal(report.dataset.license, "MIT");
  assert.equal(report.dataset.sha256, "bcc77bb51c1f662912654328fa6fc357c83dfc98d83ed6bd5007b211f201f651");
});
