import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchArticleWithFallbacks,
  isBlockedFetchError,
  SITE_BLOCKED_MESSAGE,
  titleFromArticleUrl,
  userFacingBlockedError,
} from "./url-fallback.ts";
import { UnsafeUrlError } from "../security/ssrf.ts";

test("slug URL jadi judul kasar tanpa nomor id", () => {
  const title = titleFromArticleUrl(
    "https://www.tempo.co/hukum/kapolri-listyo-sigit-tersangka-penyadapan-prabowo-2303342",
  );
  assert.equal(title, "kapolri listyo sigit tersangka penyadapan prabowo");
});

test("pesan HTTP 403 diganti teks biasa untuk analis", () => {
  const err = userFacingBlockedError(new UnsafeUrlError("Sumber menjawab HTTP 403."));
  assert.equal(err.message, SITE_BLOCKED_MESSAGE);
  assert.equal(isBlockedFetchError(new UnsafeUrlError("Sumber menjawab HTTP 403.")), true);
  assert.equal(isBlockedFetchError(new UnsafeUrlError("Host lokal ditolak.")), false);
});

test("403 dari situs asal jatuh ke cadangan jina", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("tempo.co") && !url.includes("r.jina.ai") && !url.includes("news.google.com") && !url.includes("/rss")) {
      return new Response("forbidden", { status: 403, headers: { "content-type": "text/html" } });
    }
    if (url.includes("r.jina.ai")) {
      const body = [
        "Title: Eks Kapolri Listyo Sigit Tersangka Penyadapan Prabowo",
        "",
        "Jakarta — Kejaksaan Agung menetapkan mantan Kapolri Listyo Sigit Prabowo",
        "sebagai tersangka dalam kasus dugaan penyadapan. Berita ini dikutip dari",
        "keterangan resmi dan diliput sejumlah media nasional pada hari yang sama.",
      ].join("\n");
      return new Response(body, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    return new Response("no", { status: 404, headers: { "content-type": "text/plain" } });
  };
  try {
    const page = await fetchArticleWithFallbacks(
      "https://www.tempo.co/hukum/kapolri-listyo-sigit-tersangka-penyadapan-prabowo-2303342",
    );
    assert.equal(page.via, "jina");
    assert.match(page.body, /Listyo Sigit/);
    assert.ok(calls.some((url) => url.includes("tempo.co")));
    assert.ok(calls.some((url) => url.includes("r.jina.ai")));
  } finally {
    globalThis.fetch = original;
  }
});

test("semua cadangan gagal → pesan tanpa nomor HTTP", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("no", { status: 403, headers: { "content-type": "text/html" } });
  try {
    // Slug terlalu pendek supaya cadangan metadata juga tidak punya bahan.
    await assert.rejects(
      () => fetchArticleWithFallbacks("https://www.tempo.co/x"),
      (error: unknown) =>
        error instanceof UnsafeUrlError &&
        error.message === SITE_BLOCKED_MESSAGE &&
        !/HTTP 403/i.test(error.message),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("metadata dipakai bila jina juga gagal", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("news.google.com/rss")) {
      const rss = `<?xml version="1.0"?><rss><channel>
        <item>
          <title>Eks Kapolri Listyo Sigit Tersangka Penyadapan Prabowo - CNN Indonesia</title>
          <link>https://news.google.com/rss/articles/abc</link>
          <source url="https://www.cnnindonesia.com">CNN Indonesia</source>
          <pubDate>Tue, 03 Nov 2026 10:00:00 GMT</pubDate>
        </item>
      </channel></rss>`;
      return new Response(rss, { status: 200, headers: { "content-type": "application/rss+xml" } });
    }
    if (url.includes("tempo.co/rss")) {
      return new Response("<rss><channel></channel></rss>", {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      });
    }
    return new Response("blocked", { status: 403, headers: { "content-type": "text/html" } });
  };
  try {
    const page = await fetchArticleWithFallbacks(
      "https://www.tempo.co/hukum/kapolri-listyo-sigit-tersangka-penyadapan-prabowo-2303342",
    );
    assert.equal(page.via, "metadata");
    assert.match(page.body, /kapolri listyo sigit/i);
    assert.match(page.body, /CNN Indonesia/i);
  } finally {
    globalThis.fetch = original;
  }
});
