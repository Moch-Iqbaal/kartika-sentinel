import assert from "node:assert/strict";
import test from "node:test";
import { HOAX_CALL_MIN } from "./bands.ts";
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
    shortWords: false,
    opinion: false,
    textChars: 400,
    unscored: false,
    unscoredReason: "",
    topicLabels: [],
    matches: [],
    externalCount: 0,
    ...patch,
  };
}

test("ambang skor: 0,5 ke atas hoaks, di bawahnya fakta", () => {
  assert.equal(scoreVerdict(HOAX_CALL_MIN), "hoax");
  assert.equal(scoreVerdict(1), "hoax");
  assert.equal(scoreVerdict(HOAX_CALL_MIN - 0.001), "not-hoax");
  assert.equal(scoreVerdict(0), "not-hoax");
  assert.equal(scoreVerdict(Number.NaN), "uncertain");
});

test("teks pendek memaksa belum pasti walau skor sangat tinggi", () => {
  const card = input({ hoaxScore: 0.99, shortText: true, linear: 0.99 });
  assert.equal(decideVerdict(card), "uncertain");
  const text = buildRingkasan(card);
  assert.equal(text.headline, "Belum bisa dipastikan");
  assert.match(text.sentences.join(" "), /terlalu pendek/);
  assert.ok(text.sentences.length <= 3);
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
  assert.equal(buildRingkasan(close).headline, "Kemungkinan HOAKS");
  assert.ok(buildRingkasan(close).sentences.length <= 3);
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
  assert.match(buildRingkasan(card).sentences[0], /tidak sejalan/);
  assert.doesNotMatch(buildRingkasan(card).sentences.join(" "), /IndoBERT|n-gram|model linier/);
});

test("bukti yang bertentangan menahan vonis", () => {
  const hoaxButTrue = input({
    hoaxScore: 0.8,
    linear: 0.8,
    matches: [{ verdict: "true", similarity: 0.5 }],
  });
  assert.equal(decideVerdict(hoaxButTrue), "not-hoax");
  assert.match(buildRingkasan(hoaxButTrue).sentences[0], /menyebut ini benar/);

  const lowButHoax = input({
    hoaxScore: 0.1,
    linear: 0.1,
    matches: [{ verdict: "misleading", similarity: 0.2 }, { verdict: "hoax", similarity: 0.9 }],
  });
  assert.equal(decideVerdict(lowButHoax), "uncertain");
  assert.equal(buildRingkasan(lowButHoax).headline, "Belum bisa dipastikan");
});

test("skor rendah tanpa sumber tidak dipaksa menjadi fakta", () => {
  const card = input({ hoaxScore: 0.2, linear: 0.2, indobert: null });
  const text = buildRingkasan(card);
  assert.equal(text.headline, "Belum bisa dipastikan");
  assert.match(text.sentences.join(" "), /Belum ada sumber/);
  assert.match(text.sentences.join(" "), /Keputusan akhir ada pada analis/);
  assert.doesNotMatch(text.sentences.join(" "), /IndoBERT|n-gram|model linier/);
  assert.ok(text.sentences.length <= 3);
});

test("ringkasan hoaks paling banyak tiga kalimat awam", () => {
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
  assert.match(text.sentences.join(" "), /hoaks/);
  assert.match(text.sentences.join(" "), /Keputusan akhir ada pada analis/);
  assert.ok(text.sentences.length <= 3);
  assert.equal(text.sentences.length >= 2, true);
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
  assert.match(text.sentences.join(" "), /Keputusan akhir ada pada analis/);
  assert.ok(text.sentences.length <= 3);
});

test("skor 50–70% tanpa bukti hoaks belum pasti, di bawah 50% fakta", () => {
  const mid = buildRingkasan(input({ hoaxScore: 0.62, linear: 0.62 }));
  assert.equal(mid.headline, "Belum bisa dipastikan");
  assert.match(mid.sentences.join(" "), /belum cukup/);
  const fact = buildRingkasan(input({ hoaxScore: 0.45, linear: 0.45 }));
  assert.equal(fact.headline, "Belum bisa dipastikan");
  const strong = buildRingkasan(input({ hoaxScore: 0.85, linear: 0.85 }));
  assert.equal(strong.headline, "Kemungkinan HOAKS");
});

test("sensitivitas dan viralitas tidak mengubah vonis", () => {
  const low = decideVerdict(input({ hoaxScore: 0.62, linear: 0.62, sensitivity: 0.95, virality: 0.9 }));
  const high = decideVerdict(input({ hoaxScore: 0.62, linear: 0.62, sensitivity: 0.1, virality: 0 }));
  assert.equal(low, "uncertain");
  assert.equal(high, "uncertain");
});

test("opini tidak menahan vonis bila keyakinan bukan rendah", () => {
  const text = buildRingkasan(input({
    hoaxScore: 0.8,
    linear: 0.8,
    opinion: true,
    textChars: 400,
  }));
  assert.equal(text.headline, "Kemungkinan HOAKS");
  assert.match(text.sentences.join(" "), /Isinya terbaca sebagai kritik kebijakan, dan kritik bukan hoaks/);
  assert.doesNotMatch(text.sentences.join(" "), /Ini terbaca sebagai kritik\. kritik/);
  assert.ok(text.sentences.length <= 3);
});

test("hasil sama bila masukan sama", () => {
  const card = input({ hoaxScore: 0.66, linear: 0.66 });
  assert.deepEqual(buildRingkasan(card), buildRingkasan(card));
});
