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
    similarity: 0.9,
  }]);
  assert.deepEqual(own, []);
  const other = independentReports(KOMPAS, KOMPAS_TEXT, [{
    source: "Antara",
    title: "Pemerintah jelaskan insentif MBG",
    url: "https://www.antaranews.com/berita/9/pemerintah-jelaskan-insentif",
    rating: null,
    publisher: "Antara",
    similarity: 0.7,
  }]);
  assert.equal(other[0]?.name, "Antara");
});

test("video Kompas tanpa penguat menjadi HOAKS", () => {
  const text = buildRingkasan(input({ text: KOMPAS_TEXT, sourceUrl: KOMPAS }));
  assert.equal(decideVerdict(input({ text: KOMPAS_TEXT, sourceUrl: KOMPAS })), "hoax");
  assert.equal(text.headline, "Kemungkinan HOAKS");
  assert.match(text.sentences.join(" "), /Belum ada media atau sumber resmi lain/);
  assert.doesNotMatch(text.sentences.join(" "), /dua penilaian tidak sejalan|IndoBERT/);
});

test("video Tribun 99,3 persen tanpa penguat menjadi HOAKS", () => {
  const card = input({
    hoaxScore: REPORTED_TRIBUN,
    indobert: REPORTED_TRIBUN,
    linear: REPORTED_TRIBUN,
    heuristic: REPORTED_TRIBUN,
    text: TRIBUN_TEXT,
  });
  assert.equal(buildRingkasan(card).headline, "Kemungkinan HOAKS");
});

test("media lain yang bukan asal mengubah vonis menjadi fakta", () => {
  const text = buildRingkasan(input({
    otherOutlets: ["Antara", "CNN Indonesia"],
    text: KOMPAS_TEXT,
  }));
  assert.equal(text.headline, "Kemungkinan FAKTA");
  assert.match(text.sentences.join(" "), /Antara dan CNN Indonesia/);
});

test("pemeriksaan fakta hoaks mengalahkan angka rendah", () => {
  const text = buildRingkasan(input({
    hoaxScore: 0.2,
    indobert: 0.2,
    linear: 0.2,
    hoaxCheckers: ["TurnBackHoax"],
    matches: [{ verdict: "hoax", similarity: 0.8 }],
    text: "Klaim yang sudah dibantah.",
  }));
  assert.equal(text.headline, "Kemungkinan HOAKS");
  assert.match(text.sentences.join(" "), /TurnBackHoax menyebut klaim ini hoaks/);
});

const YONIF_TEXT = [
  "450 Prajurit TNI AD Yonif 143 Kembali ke Lampung Usai Bertugas di Perbatasan RI-PNG",
  "Kanal: Tribunnews",
  "Download aplikasi berita TribunX di Play Store atau App Store untuk dapatkan pengalaman baru TRIBUN-VIDEO.COM - Tribunners, sebanyak 450 prajurit TNI AD Yonif 143 Tri Wira Eka Jaya kembali ke Lampung setelah menyelesaikan tugas pengamanan perbatasan Indonesia-Papua Nugini.",
].join("\n\n");

test("berita Tribun Yonif 143 dengan penguat menjadi FAKTA", () => {
  const card = input({
    hoaxScore: 0.993,
    indobert: 0.993,
    linear: 0.3416,
    heuristic: 0.22,
    textChars: YONIF_TEXT.length,
    text: YONIF_TEXT,
    sourceUrl: "https://www.youtube.com/watch?v=YEfOFbJSuYQ",
    otherOutlets: ["Antara", "Detik"],
  });
  const text = buildRingkasan(card);
  assert.equal(decideVerdict(card), "not-hoax");
  assert.equal(text.headline, "Kemungkinan FAKTA");
  assert.match(text.sentences[0], /Berita ini menyebut/);
  assert.match(text.sentences.join(" "), /Antara dan Detik/);
  assert.equal(text.confidence, "Tinggi");
});

test("Tempo Listyo dengan penguat CNN menjadi FAKTA", () => {
  const body = [
    "Eks Kapolri Listyo Sigit Tersangka Penyadapan Prabowo",
    "TEMPO.CO, Jakarta - Bareskrim Polri menetapkan tiga tersangka dugaan penyadapan ilegal terhadap Presiden.",
  ].join("\n\n");
  const card = input({
    text: body,
    sourceUrl: "https://www.tempo.co/politik/eks-kapolri-listyo-sigit",
    otherOutlets: ["CNN Indonesia", "Kumparan"],
    hoaxScore: 0.3,
    indobert: 0.3,
    linear: 0.25,
  });
  const text = buildRingkasan(card);
  assert.equal(text.headline, "Kemungkinan FAKTA");
  assert.match(text.sentences.join(" "), /CNN Indonesia dan Kumparan/);
  assert.doesNotMatch(text.sentences.join(" "), /Tempo memberitakan/);
});

test("tempo sendiri tidak jadi penguat walau ada artikel tempo lain", () => {
  const source = "https://www.tempo.co/politik/eks-kapolri-listyo-sigit";
  const body = [
    "Eks Kapolri Listyo Sigit Tersangka Penyadapan Prabowo",
    "TEMPO.CO, Jakarta - Bareskrim Polri menetapkan tiga tersangka dugaan penyadapan ilegal terhadap Presiden.",
  ].join("\n\n");
  assert.equal(originMarker(source, body), "tempo");
  const own = independentReports(source, body, [{
    source: "Tempo",
    title: "Listyo Sigit ditetapkan tersangka",
    url: "https://www.tempo.co/politik/listyo-sigit-ditetapkan-tersangka",
    rating: null,
    publisher: "Tempo",
    similarity: 0.8,
  }, {
    source: "CNN Indonesia",
    title: "Polri tetapkan Listyo tersangka",
    url: "https://www.cnnindonesia.com/nasional/listyo",
    rating: null,
    publisher: "CNN Indonesia",
    similarity: 0.75,
  }]);
  assert.equal(own.some((item) => item.name === "Tempo"), false);
  assert.equal(own[0]?.name, "CNN Indonesia");
});

test("rumor X Divpropam tanpa penguat menjadi HOAKS", () => {
  const rumor = [
    "Dikabarkan Divpropam memeriksa perwira terkait isu penyadapan.",
    "Kabarnya beredar di WA grup. Polri belum membantah maupun membenarkan.",
  ].join(" ");
  const text = buildRingkasan(input({
    text: rumor,
    sourceUrl: "https://x.com/liclerc/status/2117550017837928494",
    hoaxScore: 0.05,
    indobert: 0.05,
    linear: 0.1,
    textChars: rumor.length,
  }));
  assert.equal(text.headline, "Kemungkinan HOAKS");
  assert.match(text.sentences.join(" "), /Belum ada media atau sumber resmi lain yang memberitakan hal ini, jadi isinya belum bisa dipercaya/);
  assert.equal(text.confidence, "Rendah");
});


test("cnn artis tidak menguatkan rumor divpropam", () => {
  const rumor = "Dikabarkan Divpropam memeriksa perwira. Kabarnya beredar di WA grup, Polri belum membantah.";
  const weak = independentReports(null, rumor, [{
    source: "CNN Indonesia",
    title: "KPK Belum Terima Laporan Terkait Artis Inisial R di Kasus Rafael Alun",
    url: "https://www.cnnindonesia.com/nasional/artis-inisial-r",
    rating: null,
    publisher: "CNN Indonesia",
    similarity: 0.22,
  }]);
  assert.deepEqual(weak, []);
  const strong = independentReports("https://www.tempo.co/politik/listyo", "Listyo Sigit tersangka penyadapan Prabowo", [{
    source: "CNN Indonesia",
    title: "Jenderal Listyo Sigit tersangka sadap Prabowo",
    url: "https://www.cnnindonesia.com/nasional/listyo-sigit-tersangka",
    rating: null,
    publisher: "CNN Indonesia",
    similarity: 0.72,
    publishedAt: "2026-11-03",
  }]);
  assert.equal(strong[0]?.name, "CNN Indonesia");
});
