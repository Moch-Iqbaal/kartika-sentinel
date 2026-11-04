import assert from "node:assert/strict";
import test from "node:test";
import {
  cekfaktaQuery,
  checkedAtLabel,
  dedupeFacts,
  factDateLabel,
  claimQueries,
  entitySimilarity,
  extractEntities,
  googleNewsQueries,
  peerQueries,
  peerSimilarity,
  urlFirstQueries,
  parseGoogleNewsRss,
  factQuery,
  keywordSimilarity,
  parseDetikSearch,
  parseKompasSearch,
  parseLiputanRss,
  normalizeFactDate,
  parseAntara,
  parseCekfakta,
  parseKomdigi,
  parseTurnbackhoax,
  relevantHit,
  sourceFamily,
  turnbackhoaxArticleUrl,
} from "./live-parse.ts";

const TBH = JSON.stringify({
  data: [
    {
      id: "30013",
      slug: "-salah-wawancara-militer-israel-soal-militer-indonesia-ke-palestina",
      title: "[SALAH] Wawancara Militer Israel soal Militer Indonesia ke Palestina",
      description: "Klaim 20 ribu prajurit TNI ke Gaza.",
      status: "Salah",
      published_at: "2025-11-12",
    },
    {
      id: "1",
      slug: "-salah-cuaca-jakarta",
      title: "[SALAH] Cuaca Jakarta",
      description: "Hujan deras di ibu kota.",
      status: "Salah",
      published_at: "2024-01-01",
    },
  ],
});

const CEK = `const responseData = ${JSON.stringify([
  {
    id: "30019",
    authors: "Tempo",
    status: "Salah",
    title: "Keliru: Video Israel soal 20 ribu tentara ke Gaza",
    content: "Rencana kirim tentara.",
    tanggal: "2025-11-12",
  },
  {
    id: "9",
    authors: "Liputan 6",
    status: "Salah",
    title: "Hoaks bonus polisi",
    content: "Tilang.",
    tanggal: "2024-02-02",
  },
])};`;

const ANTARA = `
<a href="https://www.antaranews.com/berita/4802945/hoaks-41-pasukan-khusus-tni-gugur-saat-melakukan-misi-kemanusiaan-di-gaza" title="Hoaks! 41 pasukan khusus TNI gugur di Gaza">
<span class="text-dark text-capitalize">29 April 2025</span>
</a>
<a href="https://www.antaranews.com/berita/5826263/inflasi-jakarta" title="Inflasi tahunan Jakarta">
<span class="text-dark text-capitalize">1 Mei 2026</span>
</a>`;

test("dua atau tiga frasa klaim, bukan hanya judul", () => {
  const queries = claimQueries("Blak-blakan dr Tirta Ngaku Dapat DM dari 2 Wamen soal Insentif MBG. Kanal: Tribunnews");
  assert.ok(queries.length >= 2 && queries.length <= 3);
  assert.match(queries.join(" "), /tirta|mbg|insentif/);
});

test("20.000 dibaca sebagai 20 ribu, bukan 000", () => {
  assert.equal(
    factQuery("Sebarkan! 20.000 prajurit TNI sudah diterbangkan ke Gaza sebagai pasukan perdamaian."),
    "20 ribu gaza",
  );
  assert.equal(cekfaktaQuery("Sebarkan! 20.000 prajurit TNI ke Gaza."), "20 ribu");
});

test("tautan TurnBackHoax disusun dari id dan slug yang ada", () => {
  assert.equal(
    turnbackhoaxArticleUrl("30013", "-salah-wawancara-militer-israel"),
    "https://turnbackhoax.id/articles/30013-salah-wawancara-militer-israel",
  );
  assert.equal(turnbackhoaxArticleUrl("abc", "-salah"), null);
});

test("parser menolak artikel yang tidak nyambung dan menyimpan tanggal", () => {
  const query = factQuery("Sebarkan 20 ribu prajurit TNI sudah diterbangkan ke Gaza");
  assert.equal(relevantHit(query, "cuaca jakarta hujan"), false);
  const tbh = parseTurnbackhoax(TBH, query);
  assert.equal(tbh.length, 1);
  assert.equal(tbh[0].source, "TurnBackHoax");
  assert.equal(tbh[0].publishedAt, "2025-11-12");
  assert.match(tbh[0].url ?? "", /turnbackhoax\.id\/articles\/30013-/);
  const cek = parseCekfakta(CEK, query);
  assert.equal(cek.length, 1);
  assert.equal(cek[0].publisher, "Tempo");
  assert.equal(cek[0].url, "https://cekfakta.com/focus/30019");
  const antara = parseAntara(ANTARA, "pasukan khusus TNI Gaza");
  assert.equal(antara.length, 1);
  assert.equal(antara[0].publishedAt, "2025-04-29");
  assert.equal(sourceFamily(tbh[0]), "TurnBackHoax");
  assert.equal(sourceFamily(cek[0]), "Tempo");
  assert.equal(sourceFamily(antara[0]), "Antara");
});

test("kompas, detik, dan liputan6 hanya menyimpan yang nyambung", () => {
  const kompas = `<a href="https://www.kompas.com/cekfakta/read/2026/10/27/190800482/hoaks-mbg"><img alt="Hoaks Kompas Beritakan Prabowo Hentikan MBG" /></a>
    <a href="https://www.kompas.com/cekfakta/read/2026/01/01/1/cuaca"><img alt="Cek Fakta Cuaca Jakarta" /></a>`;
  const rows = parseKompasSearch(kompas, "prabowo hentikan mbg");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].publisher, "Kompas");
  assert.equal(rows[0].publishedAt, "2026-10-27");
  const detik = `<a href="https://news.detik.com/berita/d-1/hoaks-insentif-mbg">Hoaks insentif MBG Rp1 triliun</a>
    <a href="https://news.detik.com/berita/d-2/inflasi">Inflasi pangan naik</a>`;
  assert.equal(parseDetikSearch(detik, "insentif mbg").length, 1);
  const rss = `<item><title><![CDATA[Cek Fakta: Hoaks Insentif MBG]]></title><link>https://www.liputan6.com/cek-fakta/read/1/hoaks-insentif</link></item>
    <item><title>Berita bola</title><link>https://www.liputan6.com/bola/read/2/bola</link></item>`;
  const liputan = parseLiputanRss(rss, "insentif mbg");
  assert.equal(liputan.length, 1);
  assert.equal(liputan[0].source, "Liputan6 Cek Fakta");
});

test("Komdigi yang menolak akses tidak mengarang artikel", () => {
  assert.deepEqual(parseKomdigi("<HTML><TITLE>Access Denied</TITLE></HTML>", "hoaks tni"), []);
  const html = `<a href="https://www.komdigi.go.id/berita/hoaks-tni-gaza">Klarifikasi hoaks TNI Gaza</a>
    <a href="https://www.komdigi.go.id/berita/profil">Profil menteri</a>`;
  const rows = parseKomdigi(html, "hoaks tni gaza");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "Komdigi");
});

test("padanan yang sama diurutkan dari yang paling baru", () => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const iso = (days: number) => formatter.format(new Date(Date.now() - days * 86_400_000));
  const body = JSON.stringify({
    data: [
      {
        id: "2",
        slug: "-salah-klaim-lama-gaza",
        title: "[SALAH] Klaim lama 20 ribu ke Gaza",
        description: "Klaim 20 ribu prajurit ke Gaza.",
        status: "Salah",
        published_at: iso(400),
      },
      {
        id: "3",
        slug: "-salah-klaim-baru-gaza",
        title: "[SALAH] Klaim baru 20 ribu ke Gaza",
        description: "Klaim 20 ribu prajurit ke Gaza.",
        status: "Salah",
        published_at: iso(10),
      },
    ],
  });
  const query = factQuery("Sebarkan 20 ribu prajurit sudah diterbangkan ke Gaza");
  const rows = parseTurnbackhoax(body, query);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].publishedAt, iso(10));
  assert.ok((rows[0].similarity ?? 0) > 0);
  assert.equal(keywordSimilarity(query, "20 ribu gaza"), 1);
  const merged = dedupeFacts([
    { source: "TurnBackHoax", title: "Sama", url: "https://turnbackhoax.id/articles/9-sama", rating: "Salah", publisher: null, publishedAt: iso(400), similarity: 1 },
    { source: "TurnBackHoax", title: "Sama", url: "https://turnbackhoax.id/articles/9-sama", rating: "Salah", publisher: null, publishedAt: iso(10), similarity: 1 },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].publishedAt, iso(10));
});

test("tanggal dan waktu cek memakai WIB", () => {
  assert.equal(normalizeFactDate("29 April 2025"), "2025-04-29");
  assert.match(factDateLabel("2025-11-12") ?? "", /2025/);
  assert.match(factDateLabel("2025-11-12") ?? "", /12/);
  const label = checkedAtLabel("2026-11-03T07:46:00.000Z");
  assert.match(label, /^dicek pada /);
  assert.match(label, /WIB$/);
  assert.match(label, /14[.:]46/);
});

test("URL artikel masuk kueri sebelum frasa klaim", () => {
  const queries = urlFirstQueries(
    "450 Prajurit TNI AD Yonif 143 Kembali ke Lampung\nKapenrem 043 Gatam di Pelabuhan Panjang",
    "https://www.tribunnews.com/regional/2025/yonif-143",
  );
  assert.equal(queries[0], "https://www.tribunnews.com/regional/2025/yonif-143");
  assert.ok(queries.some((item) => /tribunnews/.test(item)));
});

test("Google News RSS memakai nama outlet sebagai penerbit", () => {
  const body = `<?xml version="1.0"?><rss><channel>
    <item>
      <title>Yonif 143 kembali ke Lampung</title>
      <link>https://news.google.com/rss/articles/abc</link>
      <source url="https://www.antaranews.com/">Antara</source>
      <pubDate>Mon, 03 Nov 2025 10:00:00 GMT</pubDate>
    </item>
  </channel></rss>`;
  const facts = parseGoogleNewsRss(body, "Yonif Lampung prajurit");
  assert.ok(facts.length >= 1);
  assert.equal(facts[0].publisher, "Antara");
  assert.match(facts[0].url ?? "", /antaranews\.com/);
});

test("peerQueries pakai judul dan entitas, bukan seluruh teks", () => {
  const body = [
    "Eks Kapolri Listyo Sigit Tersangka Penyadapan Prabowo",
    "TEMPO.CO, Jakarta - Bareskrim Polri menetapkan Listyo Sigit Prabowo sebagai tersangka.",
    "Paragraf panjang yang tidak perlu masuk kueri pencarian berita penguat karena terlalu lebar dan mengacaukan Google News.",
  ].join("\n");
  const queries = peerQueries(body);
  assert.ok(queries.some((q) => /listyo/i.test(q)));
  assert.ok(queries.every((q) => q.length < 160));
  assert.ok(!queries.some((q) => /Paragraf panjang/i.test(q)));
});

test("googleNewsQueries menambah jendela when:7d", () => {
  const queries = googleNewsQueries("Listyo Sigit tersangka penyadapan Prabowo\nBareskrim Polri");
  assert.ok(queries.length >= 1);
  assert.ok(queries.every((q) => /when:7d/i.test(q)));
});

test("entitySimilarity mencocokkan parafrase judul", () => {
  const content = "Eks Kapolri Listyo Sigit Tersangka Penyadapan Prabowo\nBareskrim menetapkan tersangka.";
  const peer = "Listyo Sigit Prabowo resmi jadi tersangka kasus penyadapan";
  assert.ok(entitySimilarity(content, peer) >= 0.4);
  assert.ok(peerSimilarity("Listyo Sigit penyadapan", content, peer) >= 0.4);
  assert.ok(entitySimilarity(content, "Harga cabai naik di pasar tradisional Bandung") < 0.4);
});

test("extractEntities mengambil nama dan lembaga", () => {
  const entities = extractEntities("Eks Kapolri Listyo Sigit Tersangka Penyadapan Prabowo");
  assert.ok(entities.some((e) => /listyo/i.test(e)));
});

test("teks pendek/rumor tidak lolos peerSimilarity ke topik longgar", () => {
  const shortText = "Prajurit Yonif 143 membantu warga membangun jembatan di desa.";
  const unrelated = "Kodim Bali genjot percepatan pembangunan Jembatan Garuda untuk warga";
  assert.ok(peerSimilarity(shortText, shortText, unrelated) < 0.4);

  const rumor = "Dikabarkan Divpropam memeriksa perwira terkait isu penyadapan. Kabarnya beredar di WA grup. Polri belum membantah. Inisial LSP disebut.";
  const listyoNews = "Hukum kemarin, LSP tersangka hingga Prabowo tahu disadap";
  assert.ok(peerSimilarity(rumor.split(".")[0], rumor, listyoNews) < 0.4);
  assert.ok(peerSimilarity("Listyo Sigit penyadapan", rumor, listyoNews) < 0.4 || entitySimilarity(rumor, listyoNews) < 0.4);
});

test("Listyo parafrase tetap lolos peerSimilarity", () => {
  const content = "Eks Kapolri Listyo Sigit Tersangka Penyadapan Prabowo\nBareskrim menetapkan tersangka.";
  const peer = "Listyo Sigit Prabowo resmi jadi tersangka kasus penyadapan";
  assert.ok(peerSimilarity("Listyo Sigit penyadapan", content, peer) >= 0.4);
});
