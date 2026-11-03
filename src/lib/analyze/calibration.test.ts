import assert from "node:assert/strict";
import test from "node:test";
import { evidenceStance, independentReports, originMarker } from "./evidence-stance.ts";
import { buildRingkasan, decideVerdict, type RingkasanInput } from "./ringkasan.ts";

const REPORTED_KOMPAS = 0.624;
const REPORTED_TRIBUN = 0.993;
const KOMPAS = "https://www.youtube.com/watch?v=0uecxWhlS-w";
const KOMPAS_TEXT = [
  "Oknum TNI Polri Terjerat Korupsi MBG, Jubir Gerindra: Evaluasi Total Tapi Jangan Dihentikan",
  "Kanal: KOMPASTV JAWA TIMUR",
].join("\n\n");
const TRIBUN_TEXT = [
  "Blak-blakan dr Tirta soal insentif MBG",
  "Kanal: Tribunnews",
].join("\n\n");

function input(patch: Partial<RingkasanInput> = {}): RingkasanInput {
  return {
    hoaxScore: REPORTED_KOMPAS,
    band: "prioritas",
    sensitivity: 0.9,
    virality: 0,
    engine: "indobert-local",
    indobert: REPORTED_KOMPAS,
    linear: 0.2,
    heuristic: 0.4,
    aiFlagged: false,
    aiConfidence: "rendah",
    shortText: false,
    shortWords: false,
    opinion: false,
    textChars: 1800,
    unscored: false,
    unscoredReason: "",
    topicLabels: ["TNI"],
    matches: [],
    externalCount: 0,
    ...patch,
  };
}

test("label cek fakta tidak tertukar", () => {
  assert.equal(evidenceStance("Salah"), "hoax");
  assert.equal(evidenceStance("Hoaks"), "hoax");
  assert.equal(evidenceStance("Benar"), "valid");
  assert.equal(evidenceStance("bukan hoaks"), "valid");
  assert.equal(evidenceStance("Cek fakta"), "none");
});

test("kanal video sendiri bukan berita lain", () => {
  assert.equal(originMarker(KOMPAS, KOMPAS_TEXT), "kompas");
  assert.equal(originMarker("https://www.youtube.com/watch?v=abc", TRIBUN_TEXT), "tribun");
  const own = independentReports("https://www.youtube.com/watch?v=abc", TRIBUN_TEXT, [{
    source: "Tribunnews",
    title: "Blak-blakan dr Tirta",
    url: "https://www.tribunnews.com/nasional/insentif-mbg",
    rating: null,
    publisher: "Tribun",
  }]);
  assert.deepEqual(own, []);
  const other = independentReports(KOMPAS, KOMPAS_TEXT, [{
    source: "Antara",
    title: "Pemerintah jelaskan insentif MBG",
    url: "https://www.antaranews.com/berita/9/pemerintah-jelaskan-insentif",
    rating: null,
    publisher: "Antara",
  }]);
  assert.equal(other[0]?.name, "Antara");
});

test("video Kompas 62,4 persen tidak menjadi hoaks bila cadangan tidak sejalan", () => {
  const text = buildRingkasan(input());
  assert.equal(decideVerdict(input()), "not-hoax");
  assert.equal(text.headline, "Kemungkinan FAKTA");
  assert.equal(text.confidenceReason, "dua penilaian tidak sejalan");
  assert.match(text.sentences[0], /tidak ada pemeriksaan fakta yang menyebut hoaks/);
  assert.doesNotMatch(text.sentences.join(" "), /memberitakan hal yang sama|Belum bisa dipastikan|umn-cyber|IndoBERT/);
});

test("video Tribun 99,3 persen mengikuti angka bila tidak ada sumber lain", () => {
  const card = input({
    hoaxScore: REPORTED_TRIBUN,
    indobert: REPORTED_TRIBUN,
    linear: REPORTED_TRIBUN,
    heuristic: REPORTED_TRIBUN,
  });
  const text = buildRingkasan(card);
  assert.equal(text.headline, "Kemungkinan HOAKS");
  assert.equal(text.confidenceReason, "bukti sedikit");
  assert.match(text.sentences.join(" "), /99,3%/);
});

test("media lain yang bukan asal mengubah vonis menjadi fakta", () => {
  const text = buildRingkasan(input({ otherOutlets: ["Antara"] }));
  assert.equal(text.headline, "Kemungkinan FAKTA");
  assert.match(text.sentences[0], /Antara memberitakan hal yang sama/);
});

test("pemeriksaan fakta hoaks mengalahkan angka rendah", () => {
  const text = buildRingkasan(input({
    hoaxScore: 0.2,
    indobert: 0.2,
    linear: 0.2,
    hoaxCheckers: ["TurnBackHoax"],
    matches: [{ verdict: "hoax", similarity: 0.8 }],
  }));
  assert.equal(text.headline, "Kemungkinan HOAKS");
  assert.match(text.sentences[0], /TurnBackHoax menyebut ini hoaks/);
});

const YONIF_TEXT = [
  "450 Prajurit TNI AD Yonif 143 Kembali ke Lampung Usai Bertugas di Perbatasan RI-PNG",
  "Kanal: Tribunnews",
  "Download aplikasi berita TribunX di Play Store atau App Store untuk dapatkan pengalaman baru TRIBUN-VIDEO.COM - Tribunners, sebanyak 450 prajurit TNI AD Yonif 143 Tri Wira Eka Jaya kembali ke Lampung setelah menyelesaikan tugas pengamanan perbatasan Indonesia-Papua Nugini. Kedatangan mereka disambut di Pelabuhan Panjang, Bandar Lampung, Selasa (3/11/2026). Pjs Kapenrem 043 Gatam, Kapten Denny Charliansyah, memastikan seluruh 450 personel kembali dengan selamat dan jumlah yang sama seperti saat diberangkatkan.",
].join("\n\n");

test("berita Tribun kepulangan Yonif 143 tidak menjadi hoaks dari angka tinggi sendirian", () => {
  const card = input({
    hoaxScore: 0.993,
    indobert: 0.993,
    linear: 0.3416,
    heuristic: 0.22,
    textChars: YONIF_TEXT.length,
    text: YONIF_TEXT,
    sourceUrl: "https://www.youtube.com/watch?v=YEfOFbJSuYQ",
  });
  const text = buildRingkasan(card);
  assert.equal(decideVerdict(card), "not-hoax");
  assert.equal(text.headline, "Kemungkinan FAKTA");
  assert.equal(text.confidenceReason, "dua penilaian tidak sejalan");
  assert.match(text.sentences[0], /berita dari kanal berita/);
  const unrelated = input({
    hoaxScore: 0.2806,
    indobert: null,
    linear: 0.2806,
    heuristic: 0.22,
    engine: "linear-ngram",
    matches: [{ verdict: "hoax", similarity: 0.6711 }],
  });
  assert.equal(decideVerdict(unrelated), "not-hoax");
  assert.doesNotMatch(buildRingkasan(unrelated).sentences.join(" "), /menyebut ini hoaks/);
  assert.doesNotMatch(text.sentences.join(" "), /memberitakan hal yang sama|umn-cyber|IndoBERT|n-gram/);
  const named = buildRingkasan(input({
    hoaxScore: 0.2,
    indobert: 0.2,
    linear: 0.2,
    hoaxCheckers: ["umn-cyber/mafindo-2024"],
  }));
  assert.equal(named.headline, "Kemungkinan HOAKS");
  assert.match(named.sentences[0], /Mafindo menyebut ini hoaks/);
  assert.doesNotMatch(named.sentences.join(" "), /umn-cyber/);
});
