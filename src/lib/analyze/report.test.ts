import assert from "node:assert/strict";
import test from "node:test";
import { plainBand } from "./bands.ts";
import { buildEvidence, plainTopicLine, scoreLines } from "./report.ts";
import type { ExternalFact } from "../factcheck/types.ts";

function fact(patch: Partial<ExternalFact>): ExternalFact {
  return {
    source: "TurnBackHoax",
    title: "Judul",
    url: "https://turnbackhoax.id/articles/1-contoh",
    rating: "Salah",
    publisher: "TurnBackHoax",
    publishedAt: "2025-11-12",
    ...patch,
  };
}

test("pita angka mengikuti batas yang sama dengan nilainya", () => {
  assert.equal(plainBand(0.62), "sedang");
  assert.equal(plainBand(0.66), "tinggi");
  assert.equal(plainBand(0.4), "sedang");
  assert.equal(plainBand(0.399), "rendah");
  assert.equal(plainBand(0), "rendah");
  const lines = scoreLines(0.62, 0.72, 0);
  assert.equal(lines.utama, "Skor utama 62% = seberapa mirip hoaks");
  assert.equal(lines.utamaBand, "sedang");
  assert.equal(lines.sensitivitasBand, "tinggi");
  assert.match(lines.sensitivitas, /72%/);
  assert.equal(lines.viralitasBand, "rendah");
  assert.match(lines.viralitas, /belum ada data sebaran/);
});

test("bukti paling banyak tiga butir dan tidak mengandalkan satu sumber", () => {
  const two = buildEvidence({
    unscored: false,
    hoaxScore: 0.8,
    engine: "linear-ngram",
    live: [
      fact({}),
      fact({
        source: "Cek Fakta",
        publisher: "Tempo",
        title: "Keliru: 20 ribu tentara",
        url: "https://cekfakta.com/focus/30019",
        publishedAt: "2025-11-12",
      }),
      fact({
        source: "Antara",
        publisher: "Antara",
        title: "Hoaks lain",
        url: "https://www.antaranews.com/berita/1/hoaks-lain",
      }),
    ],
  });
  assert.equal(two.length, 3);
  assert.match(two[2].text, /Belum ada sumber lain yang memberitakan/);
  assert.match(two[0].text, /TurnBackHoax/);
  assert.match(two[0].text, /2025/);
  assert.match(two[1].text, /Tempo/);
  assert.equal(two[1].href, "https://cekfakta.com/focus/30019");
  assert.doesNotMatch(two.map((item) => item.text).join(" "), /n-gram|IndoBERT/);
  assert.doesNotMatch(two.map((item) => item.text).join(" "), /Hanya satu sumber/);

  const one = buildEvidence({
    unscored: false,
    hoaxScore: 0.8,
    engine: "linear-ngram",
    live: [fact({}), fact({ title: "Artikel kedua", url: "https://turnbackhoax.id/articles/2-lain" })],
  });
  assert.equal(one.length, 2);
  assert.match(one[1].text, /Belum ada sumber lain yang memberitakan/);

  const none = buildEvidence({ unscored: false, hoaxScore: 0.2, engine: "linear-ngram", live: [] });
  assert.match(none.map((item) => item.text).join(" "), /Belum ada sumber/i);
  assert.ok(none.length <= 3);
});

test("topik menampilkan nama biasa, paling banyak dua, tanpa slug", () => {
  assert.equal(
    plainTopicLine(["Misi luar negeri / Gaza", "TNI", "Kodam"]),
    "Topik: Misi luar negeri / Gaza. Juga: TNI.",
  );
  assert.equal(plainTopicLine(["misi-luar-negeri", "TNI"]), "Topik: TNI.");
  assert.match(plainTopicLine(["misi-luar-negeri"]), /Tidak ada topik/);
});
