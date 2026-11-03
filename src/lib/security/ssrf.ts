import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Penjaga SSRF untuk URL yang ditempel analis.
 * Hanya http/https, port 80/443, bukan IP privat/loopback/link-local/metadata.
 * Tiap redirect diperiksa ulang. Ukuran dan tipe konten dibatasi.
 */

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.internal.",
]);

const ALLOWED_TYPES = [
  "text/html",
  "text/plain",
  "application/json",
  "application/xhtml+xml",
  "application/xml",
  "text/xml",
  "application/rss+xml",
  "application/atom+xml",
];

/**
 * Batas unduhan HTML/teks. Dulu 200 KB, dan itu menolak halaman berita yang sah:
 * Detik sekitar 250 KB dan Liputan6 sekitar 300 KB, dengan pesan
 * "Respons melebihi batas ukuran."
 * 4 MB cukup untuk halaman berat, tetapi pembacaan berhenti di batas ini
 * dan awalan yang sudah diterima tetap dipakai. Respons tidak ditolak hanya
 * karena panjang. Penjaga SSRF dan tipe konten tidak dilonggarkan.
 */
export const MAX_TEXT_BYTES = 4_000_000;
const MAX_REDIRECTS = 2;

function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Baca aliran sampai `maxBytes`. Sisanya dibatalkan, bukan dibuang sebagai galat.
 * Potongan terakhir yang melewati batas dipotong supaya hasilnya tepat `maxBytes`.
 */
export async function readAtMost(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const step = await reader.read();
    if (step.done) return { bytes: concatBytes(chunks, total), truncated: false };
    const room = maxBytes - total;
    if (step.value.byteLength > room) {
      chunks.push(step.value.subarray(0, room));
      await reader.cancel().catch(() => undefined);
      return { bytes: concatBytes(chunks, maxBytes), truncated: true };
    }
    chunks.push(step.value);
    total += step.value.byteLength;
  }
  const extra = await reader.read();
  if (!extra.done) {
    await reader.cancel().catch(() => undefined);
    return { bytes: concatBytes(chunks, total), truncated: true };
  }
  return { bytes: concatBytes(chunks, total), truncated: false };
}

/**
 * Periksa tipe konten, lalu baca paling banyak `maxBytes`.
 * `charset` pada header diabaikan. Tipe di luar daftar tetap ditolak
 * sebelum badan dibaca.
 */
export async function readLimitedText(
  response: Response,
  maxBytes = MAX_TEXT_BYTES,
): Promise<{ body: string; contentType: string; truncated: boolean }> {
  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.includes(contentType)) {
    await response.body?.cancel().catch(() => undefined);
    throw new UnsafeUrlError("Tipe konten tidak diizinkan.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new UnsafeUrlError("Badan respons kosong.");
  const { bytes, truncated } = await readAtMost(reader, maxBytes);
  return {
    body: new TextDecoder("utf-8", { fatal: false }).decode(bytes),
    contentType,
    truncated,
  };
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export function isBlockedIp(raw: string): boolean {
  let value = raw.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const zone = value.indexOf("%");
  if (zone >= 0) value = value.slice(0, zone);
  if (value.startsWith("::ffff:")) {
    const mapped = value.slice("::ffff:".length);
    if (isIP(mapped) === 4) return isBlockedIp(mapped);
  }
  if (isIP(value) === 4) return blockedV4(value);
  if (isIP(value) === 6) return blockedV6(value);
  return true;
}

function blockedV4(ip: string): boolean {
  const [a, b] = ip.split(".").map((part) => Number(part));
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 168 || b === 0)) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function blockedV6(ip: string): boolean {
  if (ip === "::" || ip === "::1") return true;
  const head = parseInt(ip.split(":")[0] || "0", 16);
  if (Number.isNaN(head)) return true;
  if (head >= 0xfe80 && head <= 0xfebf) return true;
  if (head >= 0xfc00 && head <= 0xfdff) return true;
  return false;
}

export function assertPublicHttpUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError("URL tidak valid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Hanya http dan https yang diizinkan.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URL dengan kredensial ditolak.");
  }
  const port = url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);
  if (port !== 80 && port !== 443) {
    throw new UnsafeUrlError("Hanya port 80 dan 443 yang diizinkan.");
  }
  const host = url.hostname.replace(/\.$/, "").toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new UnsafeUrlError("Host lokal ditolak.");
  }
  if (isIP(host) !== 0 && isBlockedIp(host)) {
    throw new UnsafeUrlError("Alamat IP privat atau metadata ditolak.");
  }
  return url;
}

async function assertResolvedHost(hostname: string): Promise<void> {
  if (isIP(hostname) !== 0) {
    if (isBlockedIp(hostname)) throw new UnsafeUrlError("Alamat IP privat atau metadata ditolak.");
    return;
  }
  let records: { address: string }[];
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError("Nama host tidak dapat diselesaikan.");
  }
  if (records.length === 0 || records.some((record) => isBlockedIp(record.address))) {
    throw new UnsafeUrlError("Host mengarah ke alamat yang diblokir.");
  }
}

export async function safeFetchText(
  input: string,
  options?: { accept?: string; userAgent?: string; timeoutMs?: number },
): Promise<{
  finalUrl: string;
  contentType: string;
  body: string;
}> {
  let current = input;
  const timeoutMs = options?.timeoutMs ?? 5000;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = assertPublicHttpUrl(current);
    await assertResolvedHost(url.hostname);
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: options?.accept ?? "text/html,application/json,text/plain;q=0.9",
        "user-agent": options?.userAgent ?? "KartikaSentinel/0.1 (fact-check triage; +https://localhost)",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new UnsafeUrlError("Redirect tanpa tujuan.");
      current = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) {
      throw new UnsafeUrlError(`Sumber menjawab HTTP ${response.status}.`);
    }
    const limited = await readLimitedText(response);
    return {
      finalUrl: url.toString(),
      contentType: limited.contentType,
      body: limited.body,
    };
  }
  throw new UnsafeUrlError("Terlalu banyak redirect.");
}

/** POST JSON kecil ke host publik. Gagal atau redirect tidak dilempar, supaya transkrip opsional. */
export async function safePostJson(input: string, payload: unknown, timeoutMs = 4000): Promise<string | null> {
  const url = assertPublicHttpUrl(input);
  await assertResolvedHost(url.hostname);
  const response = await fetch(url, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "KartikaSentinel/0.1 (fact-check triage; +https://localhost)",
    },
    body: JSON.stringify(payload),
  });
  if (response.status >= 300 || !response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  try {
    return (await readLimitedText(response)).body;
  } catch {
    return null;
  }
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Unduh gambar publik untuk pemeriksaan metadata. Bukan unggahan pengguna mentah. */
export async function safeFetchBytes(input: string): Promise<{
  finalUrl: string;
  contentType: string;
  bytes: Uint8Array;
}> {
  let current = input;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = assertPublicHttpUrl(current);
    await assertResolvedHost(url.hostname);
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { accept: "image/jpeg,image/png,image/webp", "user-agent": "KartikaSentinel/0.1" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new UnsafeUrlError("Redirect tanpa tujuan.");
      current = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) throw new UnsafeUrlError(`Sumber menjawab HTTP ${response.status}.`);
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!IMAGE_TYPES.includes(contentType)) throw new UnsafeUrlError("Berkas bukan JPEG, PNG, atau WebP.");
    const raw = new Uint8Array(await response.arrayBuffer());
    if (raw.byteLength > 2_000_000) throw new UnsafeUrlError("Gambar melebihi 2 MB.");
    return { finalUrl: url.toString(), contentType, bytes: raw };
  }
  throw new UnsafeUrlError("Terlalu banyak redirect.");
}
