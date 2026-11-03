import assert from "node:assert/strict";
import test from "node:test";
import { HOAX_CALL_MIN } from "./bands.ts";
import { NEAR_SAME_SIMILARITY } from "../factcheck/recency.ts";
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
  assert.equal(scoreVerdict(Number.NaN), "not-hoax");
});

test("teks pendek tetap punya vonis, dengan keyakinan rendah", () => {
  const card = input({ hoaxScore: 0.99, shortText: true, linear: 0.99 });
  assert.equal(decideVerdict(card), "hoax");
  const text = buildRingkasan(card);
  assert.equal(text.headline, "Kemungkinan HOAKS");
  assert.equal(text.confidenceReason, "teks pendek");
  assert.doesNotMatch(text.sentences.join(" "), /Belum bisa dipastikan/);
  assert.ok(text.sentences.length <= 3);
});

test("selisih IndoBERT dan model linier pada ambang membuat belum pasti", () => {
  const apart = input({
    hoaxScore: 0.9,
    engine: "indobert-local",
    indobert: 0.9,
    linear: 0.9 - ENGINE_DIVERGENCE,
  });
  assert.equal(decideVerdict(apart), "hoax");
  assert.equal(buildRingkasan(apart).confidenceReason, "dua penilaian tidak sejalan");

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
  assert.equal(decideVerdict(card), "not-hoax");
  assert.equal(buildRingkasan(card).confidenceReason, "dua penilaian tidak sejalan");
  assert.doesNotMatch(buildRingkasan(card).sentences.join(" "), /IndoBERT|n-gram|model linier|Belum bisa dipastikan/);
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
  assert.equal(decideVerdict(lowButHoax), "hoax");
  assert.equal(buildRingkasan(lowButHoax).headline, "Kemungkinan HOAKS");
});

test("skor rendah tanpa sumber lain tetap fakta, keyakinan rendah", () => {
  const card = input({ hoaxScore: 0.2, linear: 0.2, indobert: null });
  const text = buildRingkasan(card);
  assert.equal(text.headline, "Kemungkinan FAKTA");
  assert.equal(text.confidenceReason, "bukti sedikit");
  assert.match(text.sentences.join(" "), /Keputusan akhir ada pada analis/);
  assert.doesNotMatch(text.sentences.join(" "), /IndoBERT|n-gram|model linier|Belum bisa dipastikan/);
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

test("skor 50 persen ke atas hoaks, di bawahnya fakta, tanpa sumber lain", () => {
  const mid = buildRingkasan(input({ hoaxScore: 0.62, linear: 0.62 }));
  assert.equal(mid.headline, "Kemungkinan HOAKS");
  assert.equal(mid.confidenceReason, "bukti sedikit");
  const fact = buildRingkasan(input({ hoaxScore: 0.45, linear: 0.45 }));
  assert.equal(fact.headline, "Kemungkinan FAKTA");
  const strong = buildRingkasan(input({ hoaxScore: 0.85, linear: 0.85 }));
  assert.equal(strong.headline, "Kemungkinan HOAKS");
  assert.doesNotMatch([mid, fact, strong].map((item) => item.headline).join(" "), /Belum bisa dipastikan/);
});

test("sensitivitas dan viralitas tidak mengubah vonis", () => {
  const low = decideVerdict(input({ hoaxScore: 0.62, linear: 0.62, sensitivity: 0.95, virality: 0.9 }));
  const high = decideVerdict(input({ hoaxScore: 0.62, linear: 0.62, sensitivity: 0.1, virality: 0 }));
  assert.equal(low, "hoax");
  assert.equal(high, "hoax");
});

test("kritik kebijakan menurunkan vonis ke fakta", () => {
  const text = buildRingkasan(input({
    hoaxScore: 0.8,
    linear: 0.8,
    opinion: true,
    textChars: 400,
  }));
  assert.equal(text.headline, "Kemungkinan FAKTA");
  assert.match(text.sentences.join(" "), /Isinya terbaca sebagai kritik kebijakan, dan kritik bukan hoaks/);
  assert.doesNotMatch(text.sentences.join(" "), /Ini terbaca sebagai kritik\. kritik/);
  assert.ok(text.sentences.length <= 3);
});

test("hasil sama bila masukan sama", () => {
  const card = input({ hoaxScore: 0.66, linear: 0.66 });
  assert.deepEqual(buildRingkasan(card), buildRingkasan(card));
});

test("pemeriksaan lama tidak membalik berita baru, kecuali klaimnya hampir sama", () => {
  const now = new Date("2026-11-03T12:00:00+07:00");
  const old = input({
    hoaxScore: 0.2,
    linear: 0.2,
    now,
    contentPublishedAt: "2026-11-03",
    matches: [{ verdict: "hoax", similarity: 0.5, publishedAt: "2024-01-01" }],
  });
  assert.equal(decideVerdict(old), "not-hoax");
  assert.doesNotMatch(buildRingkasan(old).sentences.join(" "), /menyebut ini hoaks/);

  const near = input({
    hoaxScore: 0.2,
    linear: 0.2,
    now,
    contentPublishedAt: "2026-11-03",
    matches: [{ verdict: "hoax", similarity: NEAR_SAME_SIMILARITY, publishedAt: "2024-01-01" }],
  });
  assert.equal(decideVerdict(near), "hoax");
  assert.match(buildRingkasan(near).sentences[0], /menyebut ini hoaks/);

  const sameEra = input({
    hoaxScore: 0.2,
    linear: 0.2,
    now,
    contentPublishedAt: "2024-02-01",
    matches: [{ verdict: "hoax", similarity: 0.5, publishedAt: "2024-01-15" }],
  });
  assert.equal(decideVerdict(sameEra), "hoax");
});
