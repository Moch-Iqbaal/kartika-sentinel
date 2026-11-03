import assert from "node:assert/strict";
import test from "node:test";
import { AI_CONFIDENCE_SEDANG_MIN, AI_CONFIDENCE_TINGGI_MIN, AI_TEXT_DISCLAIMER, aiConfidence } from "./ai-confidence.ts";

test("keyakinan AI mengikuti ambang, dan rendah bukan bukti tulisan manusia", () => {
  assert.equal(aiConfidence(AI_CONFIDENCE_TINGGI_MIN), "tinggi");
  assert.equal(aiConfidence(AI_CONFIDENCE_SEDANG_MIN), "sedang");
  assert.equal(aiConfidence(AI_CONFIDENCE_SEDANG_MIN - 0.01), "rendah");
  assert.match(AI_TEXT_DISCLAIMER, /bukan deteksi deepfake/);
  assert.match(AI_TEXT_DISCLAIMER, /Keyakinan rendah berarti sinyal lemah/);
});
