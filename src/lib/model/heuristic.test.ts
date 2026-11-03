import assert from "node:assert/strict";
import test from "node:test";
import { heuristicHoax } from "./heuristic.ts";

test("ajakan sebar mendapat skor lebih tinggi daripada rilis resmi", () => {
  const hoax = heuristicHoax("Sebarkan! 20.000 prajurit TNI sudah diterbangkan ke Gaza. Info rahasia.");
  const release = heuristicHoax("Menurut keterangan tertulis Kapuspen, latihan udara digelar di Jakarta.");
  assert.ok(hoax.probability > release.probability);
});
