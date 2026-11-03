import { timingSafeEqual } from "node:crypto";

/** Heartbeat lebih tua dari ini dianggap Mac mati. Skrip mengirim tiap 30 detik. */
export const HEARTBEAT_STALE_MS = 90_000;

export function heartbeatFresh(seenAtMs: number, nowMs: number): boolean {
  if (!Number.isFinite(seenAtMs) || !Number.isFinite(nowMs)) return false;
  const age = nowMs - seenAtMs;
  return age >= 0 && age <= HEARTBEAT_STALE_MS;
}

export function secretsMatch(given: string, expected: string): boolean {
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Terima origin tunnel atau URL /classify. Hanya https publik. */
export function classifyUrl(input: string): URL | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.replace(/\.$/, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return null;
  if (host === "metadata.google.internal") return null;
  url.hostname = host;
  url.hash = "";
  if (url.pathname === "/" || url.pathname === "") url.pathname = "/classify";
  return url;
}

export function bearerSecret(header: string | null): string {
  if (!header) return "";
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? "";
}
