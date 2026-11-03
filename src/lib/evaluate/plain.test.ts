import assert from "node:assert/strict";
import test from "node:test";
import { loadEvaluation } from "./report.ts";
import { plainEval, wholePercent } from "./plain.ts";

test("judul halaman dihitung dari matriks, bukan angka tetap", () => {
  const report = loadEvaluation();
  const confusion = report.linear.confusion!;
  const plain = plainEval(confusion);
  assert.equal(plain.n, confusion.tp + confusion.tn + confusion.fp + confusion.fn);
  assert.equal(plain.correct, confusion.tp + confusion.tn);
  assert.equal(plain.percent, wholePercent(plain.correct, plain.n));
  assert.equal(plain.falseAlarm, confusion.fp);
  assert.equal(plain.missed, confusion.fn);
  assert.equal(plain.headline, `Dari ${plain.n} berita uji, ${plain.correct} ditebak benar (${plain.percent}%).`);
  assert.equal(plain.n, 728);
  assert.equal(plain.correct, 538);
  assert.equal(plain.percent, 74);
  assert.match(plain.takeaway, /Kecolongan lebih sering: 133/);
});
