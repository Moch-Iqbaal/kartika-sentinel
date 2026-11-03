import assert from "node:assert/strict";
import test from "node:test";
import { EMBED_DIM, cosine, embedText } from "./hashing.ts";

test("embedding berdimensi 128 dan identik dengan dirinya", () => {
  const vector = embedText("pasukan tni ke gaza");
  assert.equal(vector.length, EMBED_DIM);
  assert.ok(Math.abs(cosine(vector, vector) - 1) < 1e-6);
});

test("teks kosong tidak menghasilkan NaN", () => {
  const vector = embedText("   ");
  assert.ok(vector.every((value) => value === 0));
  assert.equal(cosine(vector, embedText("tni")), 0);
});
