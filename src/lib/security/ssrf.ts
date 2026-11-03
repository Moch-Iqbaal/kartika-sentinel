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
];

const MAX_BYTES = 200_000;
const MAX_REDIRECTS = 2;

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

export async function safeFetchText(input: string): Promise<{
  finalUrl: string;
  contentType: string;
  body: string;
}> {
  let current = input;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = assertPublicHttpUrl(current);
    await assertResolvedHost(url.hostname);
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      headers: {
        accept: "text/html,application/json,text/plain;q=0.9",
        "user-agent": "KartikaSentinel/0.1 (fact-check triage; +https://localhost)",
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
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.includes(contentType)) {
      throw new UnsafeUrlError("Tipe konten tidak diizinkan.");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new UnsafeUrlError("Badan respons kosong.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      total += step.value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new UnsafeUrlError("Respons melebihi batas ukuran.");
      }
      chunks.push(step.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      finalUrl: url.toString(),
      contentType,
      body: new TextDecoder("utf-8", { fatal: false }).decode(bytes),
    };
  }
  throw new UnsafeUrlError("Terlalu banyak redirect.");
}
