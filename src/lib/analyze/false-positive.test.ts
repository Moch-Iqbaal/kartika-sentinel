import assert from "node:assert/strict";
import test from "node:test";
import { KNOWN_FALSE_POSITIVES } from "../../../tests/known-cases.ts";
import { extractArticle } from "../ingest/article.ts";
import { dampenShortTextProbability, MIN_RELIABLE_WORDS, SHORT_WORD_VERDICT, shortTextCaution, shortWordCaution, wordCount } from "../ingest/short-text.ts";
import { detectOpinion, OPINION_SENTENCE } from "./opinion.ts";
import { buildRingkasan, decideVerdict, type RingkasanInput } from "./ringkasan.ts";
import { assertScorableText, isNonContentText } from "./content-guard.ts";
import { inspectImage } from "../media/metadata.ts";
import { UNSCORED_IMAGE_REASON, unscoredImageCard } from "./unscored.ts";

const HEADLINE = "Pelibatan TNI di MBG Tak Selaras UU";

function card(patch: Partial<RingkasanInput> = {}): RingkasanInput {
  return {
    hoaxScore: 0.5,
    band: "prioritas",
    sensitivity: 0.5,
    virality: 0,
    engine: "indobert-local",
    indobert: 0.5,
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

test("judul MBG di bawah 20 kata: pagar kata tetap hidup, tanpa penguat = HOAKS", () => {
  const note = shortWordCaution(HEADLINE, 0.99);
  assert.equal(note?.warning, SHORT_WORD_VERDICT);
  assert.equal(note?.probability, dampenShortTextProbability(0.99));
  assert.ok((note?.probability ?? 1) < 0.66);
  const text = buildRingkasan(card({
    hoaxScore: note?.probability ?? 0.99,
    shortText: true,
    shortWords: true,
    opinion: true,
    text: HEADLINE,
    textChars: HEADLINE.length,
  }));
  assert.equal(text.headline, "Kemungkinan HOAKS");
  assert.ok(text.confidenceReason === "teks yang dinilai masih pendek" || text.confidenceReason === "belum ada media lain yang memberitakan");
  assert.equal(KNOWN_FALSE_POSITIVES.some((item) => item.title === HEADLINE), true);
});

test("selisih 99 persen lawan 60,8 persen tanpa penguat = HOAKS", () => {
  const input = card({
    hoaxScore: 0.99,
    indobert: 0.99,
    linear: 0.608,
    textChars: 800,
    text: "Narasi panjang tanpa media lain yang menguatkan klaim ini secara independen.",
  });
  assert.equal(decideVerdict(input), "hoax");
  assert.equal(buildRingkasan(input).headline, "Kemungkinan HOAKS");
});

test("tepat 20 kata tidak kena pagar kata", () => {
  const text = Array.from({ length: MIN_RELIABLE_WORDS }, () => "kata").join(" ");
  assert.equal(shortWordCaution(text, 0.99), null);
  assert.ok(shortWordCaution(text.split(" ").slice(0, -1).join(" "), 0.99));
});

test("rilis tniad yang hanya judul: teks pendek tetap ditandai", () => {
  const html = `<html><head>
    <title>Kasad lepas pasukan latihan</title>
    <meta name="description" content="Cuplikan meta yang dulu ikut dinilai sebagai seluruh berita TNI AD." />
  </head><body><article><h1>Kasad lepas pasukan latihan</h1></article></body></html>`;
  const page = extractArticle(html);
  assert.ok(page.body.length < 200);
  const scored = `${page.title} ${page.body}`.trim();
  const note = shortWordCaution(scored, 0.999) ?? shortTextCaution(page.body.length, 0.999);
  assert.ok(note);
  assert.ok(note.probability < 0.7);
  const text = buildRingkasan(card({
    hoaxScore: note.probability,
    indobert: note.probability,
    shortText: true,
    shortWords: wordCount(scored) < MIN_RELIABLE_WORDS,
    text: scored,
    textChars: scored.length,
  }));
  assert.ok(text.confidenceReason === "teks yang dinilai masih pendek" || text.confidenceReason === "belum ada media lain yang memberitakan");
  assert.equal(text.headline, "Kemungkinan HOAKS");
  assert.equal(KNOWN_FALSE_POSITIVES.some((item) => item.id === "tniad"), true);
});

test("infografis Antara tidak menilainya dari teks metadata", () => {
  const raw = "Berkas gambar image/jpeg. Tidak ada nama pembuat atau penanda C2PA yang dikenali. Metadata kosong tidak membuktikan gambar itu asli.";
  assert.equal(isNonContentText(raw), true);
  assert.throws(() => assertScorableText(raw));
  const image = inspectImage(Uint8Array.from([0xff, 0xd8, 0xff]), "image/jpeg");
  const saved = unscoredImageCard(image, UNSCORED_IMAGE_REASON);
  assert.equal(saved.assessment.modelVersion, "belum-dinilai");
  assert.match(saved.assessment.unscored?.reason ?? "", /Belum bisa dinilai/);
  const text = buildRingkasan(card({
    unscored: true,
    hoaxScore: 0,
    unscoredReason: saved.assessment.unscored?.reason,
  }));
  assert.equal(text.headline, "Belum bisa dinilai");
  assert.equal(KNOWN_FALSE_POSITIVES.some((item) => item.id === "antara-mbg"), true);
});

test("video Tribun Yonif 143 dengan penguat tetap FAKTA", () => {
  const title = "450 Prajurit TNI AD Yonif 143 Kembali ke Lampung Usai Bertugas di Perbatasan RI-PNG";
  const description = "Kapenrem 043 Gatam Kolonel Inf Asep Suryana menyambut kedatangan prajurit di Pelabuhan Panjang.";
  const input = card({
    hoaxScore: 0.993,
    indobert: 0.993,
    linear: 0.34,
    heuristic: 0.28,
    textChars: 800,
    text: `${title}\n${description} Prajurit kembali ke markas setelah tugas di perbatasan RI-PNG dan disambut keluarga serta pejabat daerah.`,
    sourceUrl: "https://www.youtube.com/watch?v=YEfOFbJSuYQ",
    otherOutlets: ["Antara"],
  });
  assert.equal(decideVerdict(input), "not-hoax");
  const text = buildRingkasan(input);
  assert.equal(text.headline, "Kemungkinan FAKTA");
  assert.equal(text.confidence, "Sedang");
});

test("berita biasa tanpa kata kritik tidak ditandai opini", () => {
  const plain = "Panglima membuka latihan bersama di markas pada Senin pagi dan menjelaskan jadwal kepada awak media yang hadir di lapangan upacara.";
  assert.equal(detectOpinion(plain), null);
  assert.ok(detectOpinion('Menurut "Koalisi Masyarakat Sipil", kebijakan itu keliru.'));
  assert.match(OPINION_SENTENCE, /kritik/);
});
