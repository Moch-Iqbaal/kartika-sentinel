import assert from "node:assert/strict";
import test from "node:test";
import { stylometrySignals } from "./stylometry.ts";

test("teks pendek tidak menghasilkan sinyal stilometri", () => {
  assert.deepEqual(stylometrySignals("TNI latihan di Jakarta."), []);
});

test("kalimat yang panjangnya seragam memunculkan sinyal gaya", () => {
  const text = Array.from({ length: 8 }, () => "pasukan bergerak pagi hari ini dengan tertib").join(". ");
  const names = stylometrySignals(text).map((item) => item.name);
  assert.ok(names.includes("panjang kalimat seragam"));
});
