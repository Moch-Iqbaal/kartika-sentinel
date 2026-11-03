import assert from "node:assert/strict";
import test from "node:test";
import { actionBadge } from "./action-badge.ts";

test("badge mengikuti vonis dan keyakinan, tanpa ambang baru", () => {
  assert.deepEqual(actionBadge("unscored", null), { label: "Belum bisa dinilai", tone: "kosong" });

  assert.equal(actionBadge("not-hoax", "Tinggi").label, "Aman");
  assert.equal(actionBadge("not-hoax", "Sedang").label, "Cukup dipantau");
  assert.equal(actionBadge("not-hoax", "Rendah").label, "Perlu dicek");

  assert.equal(actionBadge("hoax", "Tinggi").label, "Segera ditinjau");
  assert.equal(actionBadge("hoax", "Sedang").label, "Perlu ditinjau");
  assert.equal(actionBadge("hoax", "Rendah").label, "Perlu ditinjau");
});

test("kasus FAKTA Tinggi tidak lagi Cukup dipantau", () => {
  const badge = actionBadge("not-hoax", "Tinggi");
  assert.equal(badge.label, "Aman");
  assert.notEqual(badge.label, "Cukup dipantau");
});
