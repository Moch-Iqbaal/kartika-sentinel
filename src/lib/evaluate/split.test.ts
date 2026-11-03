import assert from "node:assert/strict";
import test from "node:test";
import { holdoutSplit, withoutTrainText, type LabeledRow } from "./split.ts";

test("hold-out tidak memakai indeks yang sama dengan latih", () => {
  const rows: LabeledRow[] = Array.from({ length: 20 }, (_, index) => ({
    index,
    text: `teks ${index}`,
    y: index % 2 === 0 ? 1 : 0,
  }));
  const { train, holdout } = holdoutSplit(rows, 2026, 0.8);
  const trained = new Set(train.map((row) => row.index));
  assert.equal(holdout.some((row) => trained.has(row.index)), false);
  assert.equal(train.length + holdout.length, rows.length);
});

test("teks yang sama dengan potongan latih dikeluarkan dari evaluasi", () => {
  const train = [{ text: "sama" }, { text: "latih saja" }];
  const holdout = [{ text: "sama" }, { text: "baru" }, { text: "sama" }];
  const result = withoutTrainText(train, holdout);
  assert.equal(result.dropped, 2);
  assert.deepEqual(result.kept.map((row) => row.text), ["baru"]);
});
