import assert from "node:assert/strict";
import test from "node:test";
import { extractArticle, scoredPageText } from "./article.ts";
import { dampenShortTextProbability, MIN_RELIABLE_CHARS, SHORT_TEXT_WARNING, shortTextCaution } from "./short-text.ts";
import { computeRisk } from "../scoring/risk.ts";

const OFFICIAL = [
  "Kepala Staf Angkatan Darat menerima kunjungan kehormatan dan membahas latihan bersama serta pertukaran perwira di markas.",
  "Dalam keterangan tertulis, pertemuan membahas pengembangan hubungan bilateral kedua angkatan darat tanpa ajakan menyebar rumor.",
].join("</p><p>");

/** Meniru kerangka Detik/Liputan6/WordPress: artikel sungguhan, kartu lain, iklan, dan script. */
function newsPage(): string {
  return `<!doctype html>
<html><head>
  <title>KSAD Terima Tamu, Bahas Kerja Sama &amp; Latihan</title>
  <meta property="og:description" content="Cuplikan meta yang tidak boleh menjadi tubuh artikel." />
  <script>var hoaks = "<p>Sebarkan hoaks ini sekarang juga supaya viral di grup keluarga.</p>";</script>
</head><body>
  <nav><p>Beranda Nasional menu portal yang tidak boleh masuk ke tubuh berita.</p></nav>
  <article class="kartu-terkait"><p>Ringkasan kartu lain.</p></article>
  <article class="detail">
    <h1>KSAD Terima Tamu, Bahas Kerja Sama</h1>
    <div class="detail__body-text itp_bodycontent">
      <p>${OFFICIAL}</p>
      <p class="para_caption">ADVERTISEMENT</p>
      <p>SCROLL TO CONTINUE WITH CONTENT</p>
      <div class="ads"><p>Sebarkan hoaks ini sekarang juga supaya viral di grup keluarga.</p></div>
    </div>
  </article>
  <footer><p>Hak cipta portal berita yang tidak ikut dinilai sama sekali.</p></footer>
</body></html>`;
}

function wordpressPage(): string {
  return `<!doctype html><html><head><title>Kasad Lepas Kontingen AARM</title></head><body>
  <header><p>Menu atas satuan yang bukan isi rilis.</p></header>
  <article class="post">
    <div class="post-content">
      <p>Jakarta, situs resmi. Kepala Staf Angkatan Darat melepas kontingen yang akan berlaga dan membawa misi kibarkan merah putih di kejuaraan regional.</p>
      <p>Kasad menekankan agar prajurit menjaga disiplin dan sportivitas, serta menunjukkan kemampuan terbaik tanpa menyebarkan klaim yang tidak bersumber.</p>
    </div>
  </article>
  </body></html>`;
}

test("mengekstrak tubuh artikel, bukan judul, iklan, atau script", () => {
  const page = extractArticle(newsPage());
  assert.equal(page.title, "KSAD Terima Tamu, Bahas Kerja Sama & Latihan");
  assert.ok(page.body.length >= MIN_RELIABLE_CHARS);
  assert.match(page.body, /latihan bersama/);
  assert.match(page.body, /keterangan tertulis/);
  assert.equal(page.body.includes("Cuplikan meta"), false);
  assert.equal(page.body.includes("Sebarkan hoaks"), false);
  assert.equal(page.body.toLowerCase().includes("advertisement"), false);
  assert.equal(page.body.includes("SCROLL TO CONTINUE"), false);
  assert.equal(page.body.includes("Beranda Nasional"), false);
  assert.equal(page.body.includes("Hak cipta"), false);
  const scored = scoredPageText(page.title, page.body);
  assert.match(scored, /^KSAD Terima Tamu/);
  assert.match(scored, /latihan bersama/);
  assert.equal(shortTextCaution(page.body.length, 0.999), null);
});

test("rilis bergaya WordPress ikut terbaca lewat article dan p", () => {
  const page = extractArticle(wordpressPage());
  assert.match(page.body, /kibarkan merah putih/);
  assert.equal(page.body.includes("Menu atas"), false);
  assert.ok(page.body.length >= MIN_RELIABLE_CHARS);
});

test("halaman tanpa paragraf jatuh ke teks di dalam article", () => {
  const sentence = "Rilis resmi satuan menjelaskan jadwal latihan dan jumlah peserta secara terbuka kepada awak media di markas.";
  const html = `<html><head><title>Rilis</title></head><body><article><div>${sentence} ${sentence}</div></article></body></html>`;
  const page = extractArticle(html);
  assert.match(page.body, /Rilis resmi satuan/);
  assert.ok(page.body.length >= MIN_RELIABLE_CHARS);
});

test("judul dan meta saja dianggap terlalu pendek", () => {
  const html = `<html><head>
    <title>Kasad Lepas Kontingen</title>
    <meta property="og:description" content="Hanya cuplikan meta yang dulu ikut dinilai sebagai seluruh berita." />
  </head><body><article class="post"><h1>Kasad Lepas Kontingen</h1></article></body></html>`;
  const page = extractArticle(html);
  assert.equal(page.title, "Kasad Lepas Kontingen");
  assert.equal(page.body.includes("cuplikan meta"), false);
  assert.ok(page.body.length < MIN_RELIABLE_CHARS);
  const note = shortTextCaution(page.body.length, 0.999);
  assert.ok(note);
  assert.equal(note?.warning, SHORT_TEXT_WARNING);
  assert.equal(note?.rawProbability, 0.999);
  assert.ok(note && note.probability < 0.7);
  assert.equal(scoredPageText(page.title, page.body), "Kasad Lepas Kontingen");
});

test("teks pendek menurunkan keyakinan dan risiko", () => {
  const raw = 0.999;
  const note = shortTextCaution(80, raw);
  assert.ok(note);
  assert.equal(note?.warning, "Teks terlalu pendek, skor tidak andal.");
  assert.equal(note?.probability, dampenShortTextProbability(raw));
  assert.ok(Math.abs((note?.probability ?? 0) - (0.5 + (raw - 0.5) * 0.25)) < 1e-12);
  const before = computeRisk(raw, 0.72, 0);
  const after = computeRisk(note?.probability ?? raw, 0.72, 0);
  assert.ok(after < before);
  assert.equal(shortTextCaution(MIN_RELIABLE_CHARS, raw), null);
  assert.equal(shortTextCaution(MIN_RELIABLE_CHARS - 1, raw)?.warning, SHORT_TEXT_WARNING);
});
