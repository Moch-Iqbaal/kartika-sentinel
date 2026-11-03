import assert from "node:assert/strict";
import test from "node:test";

const base = process.env.E2E_BASE_URL || "http://127.0.0.1:43123";

async function login() {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: "analis@kartika.local", password: "demo-analis" }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie?.() ?? [];
  const raw = cookie.find((item) => item.startsWith("ks_session=")) || response.headers.get("set-cookie") || "";
  const token = raw.split(";")[0];
  assert.match(token, /^ks_session=/);
  return token;
}

test("tanpa sesi, analisis ditolak", async () => {
  const response = await fetch(`${base}/api/analisis`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ kind: "text", text: "Sebarkan klaim ini ke grup keluarga sekarang juga." }),
  });
  assert.equal(response.status, 401);
});

test("jalur lengkap: masuk, analisis, berkas, dan pdf", async () => {
  const cookie = await login();
  const headers = { "content-type": "application/json", origin: base, cookie };
  const created = await fetch(`${base}/api/analisis`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      kind: "text",
      text: "Sebarkan! 20.000 prajurit TNI sudah diterbangkan ke Gaza sebagai pasukan perdamaian. Video formasi pesawat adalah buktinya.",
    }),
  });
  assert.equal(created.status, 200);
  const body = await created.json();
  assert.ok(body.id);
  const page = await fetch(`${base}/kasus/${body.id}`, { headers: { cookie } });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Gaza|IndoBERT|linier|Padanan/i);
  const pdf = await fetch(`${base}/api/kasus/${body.id}/pdf`, { headers: { cookie } });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get("content-type") || "", /pdf/);
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "%PDF");
  const blocked = await fetch(`${base}/api/analisis`, {
    method: "POST",
    headers,
    body: JSON.stringify({ kind: "url", url: "http://169.254.169.254/latest/meta-data" }),
  });
  assert.equal(blocked.status, 400);
});
