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

test("tanpa penguat independen vonisnya HOAKS", () => {
  const card = input({ hoaxScore: 0.2, linear: 0.2, text: "Ada kabar singkat tanpa sumber lain." });
  const text = buildRingkasan(card);
  assert.equal(decideVerdict(card), "hoax");
  assert.equal(text.headline, "Kemungkinan HOAKS");
  assert.match(text.sentences.join(" "), /Belum ada media atau sumber resmi lain yang memberitakan hal ini/);
  assert.match(text.sentences.join(" "), /Langkah berikutnya/);
  assert.equal(text.confidenceReason, "belum ada media lain yang memberitakan");
  assert.ok(text.sentences.length >= 3 && text.sentences.length <= 5);
});

test("media lain menguatkan menjadi FAKTA", () => {
  const card = input({
    hoaxScore: 0.9,
    indobert: 0.9,
    linear: 0.2,
    otherOutlets: ["CNN Indonesia", "Antara"],
    text: "Bareskrim Polri menetapkan tiga tersangka dugaan penyadapan ilegal terhadap Presiden.",
  });
  const text = buildRingkasan(card);
  assert.equal(decideVerdict(card), "not-hoax");
  assert.equal(text.headline, "Kemungkinan FAKTA");
  assert.match(text.sentences[0], /Berita ini menyebut/);
  assert.match(text.sentences.join(" "), /CNN Indonesia dan Antara/);
  assert.equal(text.confidence, "Tinggi");
  assert.doesNotMatch(text.sentences.join(" "), /dua penilaian tidak sejalan|IndoBERT|n-gram/);
});

test("satu media lain = keyakinan Sedang", () => {
  const text = buildRingkasan(input({
    otherOutlets: ["Antara"],
    text: "TNI buka suara soal pengerahan prajurit ke Jakarta.",
    textChars: 500,
  }));
  assert.equal(text.headline, "Kemungkinan FAKTA");
  assert.equal(text.confidence, "Sedang");
});

test("pemeriksaan fakta hoaks mengalahkan penguat", () => {
  const text = buildRingkasan(input({
    otherOutlets: ["Antara"],
    hoaxCheckers: ["TurnBackHoax"],
    matches: [{ verdict: "hoax", similarity: 0.9 }],
    text: "Klaim palsu tentang prajurit.",
  }));
  assert.equal(text.headline, "Kemungkinan HOAKS");
  assert.match(text.sentences.join(" "), /TurnBackHoax menyebut klaim ini hoaks/);
});

test("bukti valid mengalahkan angka tinggi", () => {
  const text = buildRingkasan(input({
    hoaxScore: 0.9,
    validCheckers: ["Cek Fakta"],
    matches: [{ verdict: "true", similarity: 0.9 }],
    text: "Klaim yang sudah dicek benar.",
  }));
  assert.equal(text.headline, "Kemungkinan FAKTA");
  assert.match(text.sentences.join(" "), /menyebut klaim ini benar/);
});

test("teks pendek tetap HOAKS tanpa penguat, keyakinan rendah", () => {
  const text = buildRingkasan(input({
    hoaxScore: 0.99,
    shortText: true,
    shortWords: true,
    text: "Klaim singkat tanpa penguat lain.",
    textChars: 40,
  }));
  assert.equal(text.headline, "Kemungkinan HOAKS");
  assert.ok(
    text.confidenceReason === "teks yang dinilai masih pendek"
    || text.confidenceReason === "belum ada media lain yang memberitakan",
  );
});

test("selisih mesin tanpa penguat tetap HOAKS", () => {
  const apart = input({
    hoaxScore: 0.9,
    engine: "indobert-local",
    indobert: 0.9,
    linear: 0.9 - ENGINE_DIVERGENCE,
    text: "Narasi tanpa media lain yang menguatkan.",
  });
  assert.equal(decideVerdict(apart), "hoax");
  assert.equal(buildRingkasan(apart).headline, "Kemungkinan HOAKS");
});

test("berkas tanpa teks isi tidak punya skor hoaks", () => {
  const text = buildRingkasan(input({
    unscored: true,
    hoaxScore: 0,
    unscoredReason: "Belum bisa dinilai. Gambar tidak punya teks yang bisa diekstrak.",
  }));
  assert.equal(decideVerdict(input({ unscored: true, hoaxScore: 0.99 })), "unscored");
  assert.equal(text.headline, "Belum bisa dinilai");
  assert.match(text.sentences.join(" "), /Langkah berikutnya/);
});

test("sensitivitas dan viralitas tidak mengubah vonis", () => {
  const base = {
    hoaxScore: 0.8,
    indobert: 0.8,
    linear: 0.75,
    engine: "indobert-local" as const,
    otherOutlets: ["Antara"],
  };
  assert.equal(decideVerdict(input({ ...base, sensitivity: 0.95, virality: 0.9 })), "not-hoax");
  assert.equal(decideVerdict(input({ ...base, sensitivity: 0.1, virality: 0 })), "not-hoax");
});

test("hasil sama bila masukan sama", () => {
  const card = input({ hoaxScore: 0.66, linear: 0.66, otherOutlets: ["Detik"] });
  assert.deepEqual(buildRingkasan(card), buildRingkasan(card));
});

test("pemeriksaan lama hampir sama tetap bisa HOAKS", () => {
  const now = new Date("2026-11-03T12:00:00+07:00");
  const near = input({
    hoaxScore: 0.2,
    linear: 0.2,
    now,
    contentPublishedAt: "2026-11-03",
    matches: [{ verdict: "hoax", similarity: NEAR_SAME_SIMILARITY, publishedAt: "2024-01-01" }],
    text: "Klaim lama yang hampir sama.",
  });
  assert.equal(decideVerdict(near), "hoax");
  assert.match(buildRingkasan(near).sentences.join(" "), /menyebut klaim ini hoaks|Belum ada media/);
});

test("rumor tanpa penguat berisi kalimat wajib", () => {
  const text = buildRingkasan(input({
    text: "Dikabarkan Divpropam memeriksa perwira. Kabarnya beredar di WA grup, Polri belum membantah.",
    textChars: 120,
  }));
  assert.equal(text.headline, "Kemungkinan HOAKS");
  assert.match(text.sentences.join(" "), /Belum ada media atau sumber resmi lain yang memberitakan hal ini, jadi isinya belum bisa dipercaya/);
});
