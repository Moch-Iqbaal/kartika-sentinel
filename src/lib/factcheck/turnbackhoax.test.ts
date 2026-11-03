import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { strongMatches, MATCH_MIN_SIMILARITY, NO_STRONG_MATCH } from "./threshold.ts";
import {
  isTurnbackhoaxArticleUrl,
  lookupArticleUrl,
  mafindoBadge,
  titlesMatch,
  turnbackhoaxSearchUrl,
} from "./turnbackhoax.ts";

test("judul dengan label [SALAH] cocok, judul lain tidak", () => {
  assert.equal(
    titlesMatch(
      "Sebanyak 700 tentara IDF menyerahkan diri kepada PBB",
      "[SALAH] Sebanyak 700 tentara IDF menyerahkan diri kepada PBB",
    ),
    true,
  );
  assert.equal(
    titlesMatch("Sebanyak 700 tentara IDF menyerahkan diri kepada PBB", "[SALAH] Gaji guru naik 60 persen"),
    false,
  );
  assert.equal(titlesMatch("TNI", "[SALAH] TNI kirim pasukan"), false);
});

test("tautan cari memakai query judul, bukan URL artikel karangan", () => {
  const href = turnbackhoaxSearchUrl("Pasukan Berani Mati");
  assert.equal(href, "https://turnbackhoax.id/?s=Pasukan%20Berani%20Mati");
  assert.equal(href.includes("/articles/"), false);
});

test("lookup menolak URL di luar artikel TurnBackHoax", () => {
  const rows = [{
    title: "Pasukan Berani Mati Bela Jokowi Bersenjata Celurit Ditangkap",
    articleTitle: "[SALAH] Pasukan Berani Mati Bela Jokowi Bersenjata Celurit Ditangkap",
    url: "https://example.com/bukan-sumber",
  }];
  assert.equal(lookupArticleUrl(rows[0].title, rows), null);
  assert.equal(isTurnbackhoaxArticleUrl("https://turnbackhoax.id/articles/1-contoh"), true);
  assert.equal(isTurnbackhoaxArticleUrl("https://turnbackhoax.id/?s=contoh"), false);
});

test("ambang 40 persen menyembunyikan padanan lemah", () => {
  assert.equal(MATCH_MIN_SIMILARITY, 0.4);
  const kept = strongMatches([
    { similarity: MATCH_MIN_SIMILARITY - 0.001 },
    { similarity: MATCH_MIN_SIMILARITY },
    { similarity: Number.NaN },
  ]);
  assert.deepEqual(kept.map((item) => item.similarity), [MATCH_MIN_SIMILARITY]);
  assert.equal(NO_STRONG_MATCH, "Tidak ada padanan kuat");
});

test("lencana mafindo membedakan label hoaks", () => {
  assert.equal(mafindoBadge("hoax"), "Sumber: Mafindo (label hoaks dari Mafindo)");
  assert.equal(mafindoBadge("unverified"), "Sumber: Mafindo (label bukan hoaks dari Mafindo)");
});

test("url yang disimpan cocok judulnya dan mengarah ke artikel TurnBackHoax", () => {
  const report = JSON.parse(readFileSync("data/seed/turnbackhoax-urls.json", "utf8")) as {
    matched: number;
    matches: { title: string; articleTitle: string; url: string }[];
  };
  assert.ok(report.matched > 0);
  assert.equal(report.matches.length, report.matched);
  for (const row of report.matches) {
    assert.equal(titlesMatch(row.title, row.articleTitle), true);
    assert.equal(isTurnbackhoaxArticleUrl(row.url), true);
    assert.equal(lookupArticleUrl(row.title, [row]), row.url);
  }
});
