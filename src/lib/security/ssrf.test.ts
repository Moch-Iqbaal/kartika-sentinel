import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicHttpUrl, isBlockedIp, MAX_TEXT_BYTES, readLimitedText, UnsafeUrlError } from "./ssrf.ts";

function streamed(text: string, chunkSize: number, type = "text/html; charset=utf-8"): Response {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(bytes.length, offset + chunkSize);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    },
  });
  return new Response(stream, { headers: { "content-type": type }, status: 200 });
}

test("menolak IP privat, loopback, dan metadata", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.4", "169.254.169.254", "::1", "fe80::1"]) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
  assert.equal(isBlockedIp("8.8.8.8"), false);
});

test("menolak skema, kredensial, dan port aneh", () => {
  assert.throws(() => assertPublicHttpUrl("file:///etc/passwd"), UnsafeUrlError);
  assert.throws(() => assertPublicHttpUrl("http://127.0.0.1/latest/meta-data"), UnsafeUrlError);
  assert.throws(() => assertPublicHttpUrl("http://localhost/admin"), UnsafeUrlError);
  assert.throws(() => assertPublicHttpUrl("https://user:pass@example.com/a"), UnsafeUrlError);
  assert.throws(() => assertPublicHttpUrl("https://example.com:22/a"), UnsafeUrlError);
  const ok = assertPublicHttpUrl("https://www.youtube.com/watch?v=abc");
  assert.equal(ok.hostname, "www.youtube.com");
});

test("batas unduhan berada di kisaran 3–5 MB", () => {
  assert.ok(MAX_TEXT_BYTES >= 3_000_000);
  assert.ok(MAX_TEXT_BYTES <= 5_000_000);
});

test("halaman berita di atas 200 KB tidak ditolak", async () => {
  const body = `<html><body><p>${"berita ".repeat(40_000)}</p></body></html>`;
  assert.ok(new TextEncoder().encode(body).byteLength > 200_000);
  const result = await readLimitedText(streamed(body, 16_384));
  assert.equal(result.truncated, false);
  assert.equal(result.contentType, "text/html");
  assert.equal(result.body, body);
});

test("di atas batas, HTML dipotong dan tidak dibuang", async () => {
  const body = `awal-artikel ${"x".repeat(5_000)} ekor-yang-tidak-ikut`;
  const result = await readLimitedText(streamed(body, 100), 1000);
  assert.equal(result.truncated, true);
  assert.equal(new TextEncoder().encode(result.body).byteLength, 1000);
  assert.ok(result.body.startsWith("awal-artikel"));
  assert.equal(result.body.includes("ekor-yang-tidak-ikut"), false);
});

test("tipe konten selain teks tetap ditolak", async () => {
  await assert.rejects(
    () => readLimitedText(streamed("bukan html", 8, "image/jpeg")),
    (error: unknown) => error instanceof UnsafeUrlError && error.message === "Tipe konten tidak diizinkan.",
  );
});
