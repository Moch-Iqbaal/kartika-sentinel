import assert from "node:assert/strict";
import test from "node:test";
import { BAND_KRITIS_MIN, BAND_PRIORITAS_MIN } from "../scoring/risk.ts";
import { ENGINE_DIVERGENCE } from "../model/divergence.ts";
import { buildRingkasan, decideVerdict, scoreVerdict, type RingkasanInput } from "./ringkasan.ts";

function input(patch: Partial<RingkasanInput> = {}): RingkasanInput {
  return {
    hoaxScore: 0.5,
    band: "prioritas",
    sensitivity: 0.72,
    virality: 0,
    engine: "linear-ngram",
    indobert: null,
    linear: 0.5,
    heuristic: 0.3,
    aiFlagged: false,
    aiConfidence: "rendah",
    shortText: false,
    textChars: 400,
    unscored: false,
    unscoredReason: "",
    topicLabels: [],
    matches: [],
    externalCount: 0,
    ...patch,
  };
}

test("ambang skor: kritis jadi hoaks, di bawah prioritas bukan hoaks, tengah belum pasti", () => {
  assert.equal(scoreVerdict(BAND_KRITIS_MIN), "hoax");
  assert.equal(scoreVerdict(1), "hoax");
  assert.equal(scoreVerdict(BAND_KRITIS_MIN - 0.001), "uncertain");
  assert.equal(scoreVerdict(BAND_PRIORITAS_MIN), "uncertain");
  assert.equal(scoreVerdict(BAND_PRIORITAS_MIN - 0.001), "not-hoax");
  assert.equal(scoreVerdict(0), "not-hoax");
  assert.equal(scoreVerdict(Number.NaN), "uncertain");
});

test("teks pendek memaksa belum pasti walau skor sangat tinggi", () => {
  const card = input({ hoaxScore: 0.99, shortText: true, linear: 0.99 });
  assert.equal(decideVerdict(card), "uncertain");
  const text = buildRingkasan(card);
  assert.equal(text.headline, "Belum bisa dipastikan");
  assert.match(text.sentences.join(" "), /terlalu pendek/);
});

test("selisih IndoBERT dan model linier pada ambang membuat belum pasti", () => {
  const apart = input({
    hoaxScore: 0.9,
    engine: "indobert-local",
    indobert: 0.9,
    linear: 0.9 - ENGINE_DIVERGENCE,
  });
  assert.equal(decideVerdict(apart), "uncertain");
  assert.match(buildRingkasan(apart).sentences[0], /tidak sejalan/);

  const close = input({
    hoaxScore: 0.9,
    engine: "indobert-local",
    indobert: 0.9,
    linear: 0.9 - ENGINE_DIVERGENCE + 0.001,
    heuristic: 0.9,
  });
  assert.equal(decideVerdict(close), "hoax");
  assert.match(buildRingkasan(close).sentences[0], /sejalan/);
});

test("selisih IndoBERT dan heuristik juga menahan vonis", () => {
  const card = input({
    hoaxScore: 0.2,
    engine: "indobert-local",
    indobert: 0.2,
    linear: null,
    heuristic: 0.2 + ENGINE_DIVERGENCE,
  });
  assert.equal(decideVerdict(card), "uncertain");
  assert.match(buildRingkasan(card).sentences[0], /heuristik tidak sejalan/);
});

test("padanan cek fakta yang bertentangan mengubah vonis menjadi belum pasti", () => {
  const hoaxButTrue = input({
    hoaxScore: 0.8,
    linear: 0.8,
    matches: [{ verdict: "true", similarity: 0.5 }],
  });
  assert.equal(decideVerdict(hoaxButTrue), "uncertain");

  const lowButHoax = input({
    hoaxScore: 0.1,
    linear: 0.1,
    matches: [{ verdict: "misleading", similarity: 0.2 }, { verdict: "hoax", similarity: 0.9 }],
  });
  assert.equal(decideVerdict(lowButHoax), "uncertain");

  const agree = input({
    hoaxScore: 0.8,
    linear: 0.8,
    matches: [{ verdict: "hoax", similarity: 0.4 }],
  });
  assert.equal(decideVerdict(agree), "hoax");
});

test("mode ringan tanpa IndoBERT tetap memakai skor utama", () => {
  const card = input({ hoaxScore: 0.2, linear: 0.2, indobert: null });
  const text = buildRingkasan(card);
  assert.equal(text.headline, "Kemungkinan BUKAN hoaks");
  const joined = text.sentences.join(" ");
  assert.match(text.sentences[0], /IndoBERT tidak dipakai/);
  assert.match(joined, /tidak ada data sebaran/);
  assert.match(joined, /isyarat media AI tidak menonjol/);
  assert.match(joined, /Keyakinan hasil Sedang/);
});

test("ringkasan menyebut isyarat, topik, padanan, dan bahwa analis yang memutuskan", () => {
  const text = buildRingkasan(input({
    hoaxScore: 0.8,
    band: "kritis",
    virality: 0.5,
    linear: 0.8,
    aiFlagged: true,
    aiConfidence: "tinggi",
    topicLabels: ["TNI"],
    matches: [{ verdict: "hoax", similarity: 0.6 }],
    externalCount: 1,
  }));
  assert.equal(text.headline, "Kemungkinan HOAKS");
  const joined = text.sentences.join(" ");
  assert.match(joined, /padanan cek fakta/);
  assert.match(joined, /Fact Check Tools/);
  assert.match(joined, /TNI/);
  assert.match(joined, /ada data sebaran/);
  assert.match(joined, /isyarat media AI/);
  assert.match(joined, /Prioritaskan peninjauan manusia/);
  assert.match(joined, /keputusan akhir ada pada analis/);
  assert.match(joined, /Keyakinan hasil/);
  assert.ok(text.sentences.length >= 3 && text.sentences.length <= 5);
});

test("berkas tanpa teks isi tidak punya skor hoaks", () => {
  const text = buildRingkasan(input({
    unscored: true,
    hoaxScore: 0,
    unscoredReason: "Belum bisa dinilai. Gambar tidak punya teks yang bisa diekstrak.",
  }));
  assert.equal(decideVerdict(input({ unscored: true, hoaxScore: 0.99 })), "unscored");
  assert.equal(text.headline, "Belum bisa dinilai");
  assert.doesNotMatch(text.sentences.join(" "), /Skor utama/);
  assert.match(text.sentences.join(" "), /keputusan akhir ada pada analis/);
});

test("keyakinan tinggi masuk ringkasan bila mesin sejalan dan ada padanan", () => {
  const text = buildRingkasan(input({
    hoaxScore: 0.8,
    engine: "indobert-local",
    indobert: 0.8,
    linear: 0.8,
    heuristic: 0.8,
    textChars: 400,
    matches: [{ verdict: "hoax", similarity: 0.5 }],
  }));
  assert.match(text.sentences.join(" "), /Keyakinan hasil Tinggi/);
});

test("hasil sama bila masukan sama", () => {
  const card = input({ hoaxScore: 0.66, linear: 0.66 });
  assert.deepEqual(buildRingkasan(card), buildRingkasan(card));
});
