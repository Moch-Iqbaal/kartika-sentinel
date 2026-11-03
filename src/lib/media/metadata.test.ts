import assert from "node:assert/strict";
import test from "node:test";
import { inspectImage } from "./metadata.ts";

test("nama pembuat di byte berkas menjadi sinyal, bukan vonis piksel", () => {
  const bytes = new TextEncoder().encode("Software\0Stable Diffusion 1.5");
  const report = inspectImage(bytes, "image/jpeg");
  assert.equal(report.generatorHint, "Stable Diffusion");
  assert.match(report.disclaimer, /tidak menilai piksel/);
});

test("penanda c2pa tidak disebut sebagai bukti palsu", () => {
  const bytes = new TextEncoder().encode("jumbf c2pa manifest");
  const report = inspectImage(bytes, "image/jpeg");
  assert.equal(report.c2paMarker, true);
  assert.match(report.signals.join(" "), /bukan vonis palsu/);
});
