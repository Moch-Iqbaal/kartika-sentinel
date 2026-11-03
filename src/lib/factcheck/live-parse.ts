import { hasHttpUrl } from "./order";
import { normalizeFactTitle } from "./turnbackhoax";
import type { ExternalFact } from "./types";

const STOP = new Set([
  "yang", "dan", "di", "ke", "dari", "untuk", "ini", "itu", "dengan", "pada", "ada", "adalah",
  "atau", "juga", "tidak", "tak", "sudah", "telah", "akan", "oleh", "sebagai", "para", "sebuah",
  "dalam", "saat", "agar", "karena", "kalau", "jika", "lebih", "sangat", "bisa", "dapat", "atas",
  "serta", "bagi", "hanya", "masih", "lalu", "nya", "ya", "video", "klaim", "berita", "hoaks",
  "hoax", "salah", "benar", "cek", "fakta", "menurut", "bahwa", "tersebut",   "orang", "tahun", "bila", "sebarkan", "bagikan", "viralkan", "wajib",
]);

const MONTHS: Record<string, string> = {
  januari: "01",
  februari: "02",
  maret: "03",
  april: "04",
  mei: "05",
  juni: "06",
  juli: "07",
  agustus: "08",
  september: "09",
  oktober: "10",
  november: "11",
  desember: "12",
};

export function contentTokens(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((word) => (word.length >= 3 && !STOP.has(word)) || (word.length >= 2 && /^\d+$/.test(word)));
}

const BROAD = new Set([
  "tni", "indonesia", "israel", "militer", "tentara", "prajurit", "video", "pasukan",
  "polri", "polisi", "presiden", "jakarta",
]);

/**
 * Kueri pendek. 20.000 dibaca "20 ribu". Kata yang terlalu umum (TNI, tentara)
 * kalah dari kata yang lebih khas, misalnya Gaza, supaya pencarian tidak melebar.
 */
export function factQuery(text: string): string {
  const normalized = text
    .replace(/\b(\d{1,3})\.000\b/g, "$1 ribu")
    .replace(/\b(\d{2,3})000\b/g, "$1 ribu");
  const number = normalized.match(/\b\d{1,3}\s+ribu\b/i)?.[0]?.toLowerCase() ?? "";
  const specific = contentTokens(normalized).filter((word) => !BROAD.has(word) && !/^(me|di|ter|ber|mem|men|meng|per)/.test(word));
  const fallback = contentTokens(normalized);
  const tail = (specific.length > 0 ? specific : fallback).filter((word) => !number.includes(word));
  const tokens = `${number} ${tail.join(" ")}`.trim().split(/\s+/).filter(Boolean).slice(0, number ? 3 : 4);
  if (tokens.length >= 2) return tokens.join(" ");
  const plain = normalized.replace(/\s+/g, " ").trim().slice(0, 80);
  return plain;
}

/** Cekfakta mengindeks frasa angka lebih longgar daripada seluruh kueri. */
export function cekfaktaQuery(text: string): string {
  const normalized = text
    .replace(/\b(\d{1,3})\.000\b/g, "$1 ribu")
    .replace(/\b(\d{2,3})000\b/g, "$1 ribu");
  return normalized.match(/\b\d{1,3}\s+ribu\b/i)?.[0]?.toLowerCase() || factQuery(text);
}

export function tokenHits(query: string, haystack: string): number {
  const words = new Set(contentTokens(haystack));
  return contentTokens(query).filter((word) => words.has(word)).length;
}

export function relevantHit(query: string, haystack: string): boolean {
  const queryWords = contentTokens(query);
  if (queryWords.length === 0) return false;
  const hits = tokenHits(query, haystack);
  if (hits >= 2) return true;
  if (queryWords.length <= 3 && hits >= 1) {
    const shared = queryWords.filter((word) => contentTokens(haystack).includes(word));
    return shared.some((word) => word.length >= 5);
  }
  return false;
}

export function normalizeFactDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const written = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!written) return null;
  const month = MONTHS[written[2].toLowerCase()];
  if (!month) return null;
  const day = written[1].padStart(2, "0");
  return `${written[3]}-${month}-${day}`;
}

export function factDateLabel(value: string | null | undefined): string | null {
  const iso = normalizeFactDate(value);
  if (!iso) return null;
  const date = new Date(`${iso}T12:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

export function checkedAtLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "dicek pada waktu yang tidak terbaca";
  const formatted = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
    hourCycle: "h23",
  }).format(date);
  return `dicek pada ${formatted} WIB`;
}

export function turnbackhoaxArticleUrl(id: string, slug: string): string | null {
  if (!/^\d+$/.test(id)) return null;
  const clean = slug.trim();
  if (!/^-?[a-z0-9-]+$/i.test(clean)) return null;
  const path = clean.startsWith("-") ? `${id}${clean}` : `${id}-${clean}`;
  return `https://turnbackhoax.id/articles/${path}`;
}

export function cekfaktaArticleUrl(id: string): string | null {
  if (!/^\d+$/.test(id)) return null;
  return `https://cekfakta.com/focus/${id}`;
}

type Ranked = ExternalFact & { hits: number };

function rankFacts(query: string, items: Array<ExternalFact & { haystack: string }>): ExternalFact[] {
  const ranked: Ranked[] = [];
  for (const item of items) {
    if (!item.title.trim()) continue;
    if (!relevantHit(query, item.haystack)) continue;
    const url = item.url && hasHttpUrl(item.url) ? item.url : null;
    ranked.push({ ...item, url, hits: tokenHits(query, item.haystack) });
  }
  ranked.sort((left, right) => right.hits - left.hits);
  const seen = new Set<string>();
  const out: ExternalFact[] = [];
  for (const item of ranked) {
    const key = (item.url ?? normalizeFactTitle(item.title)).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      source: item.source,
      title: item.title.replace(/\s+/g, " ").trim(),
      url: item.url,
      rating: item.rating,
      publisher: item.publisher,
      publishedAt: normalizeFactDate(item.publishedAt),
    });
    if (out.length >= 3) break;
  }
  return out;
}

export function extractJsonArray(source: string, marker: string): unknown[] | null {
  const at = source.indexOf(marker);
  if (at < 0) return null;
  const start = source.indexOf("[", at);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          const value = JSON.parse(source.slice(start, index + 1)) as unknown;
          return Array.isArray(value) ? value : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function plainText(value: unknown): string {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function parseTurnbackhoax(body: string, query: string): ExternalFact[] {
  let payload: { data?: unknown[] };
  try {
    payload = JSON.parse(body) as { data?: unknown[] };
  } catch {
    return [];
  }
  const items: Array<ExternalFact & { haystack: string }> = [];
  for (const row of payload.data ?? []) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const id = String(record.id ?? "");
    const slug = String(record.slug ?? "");
    const title = plainText(record.title);
    const url = turnbackhoaxArticleUrl(id, slug);
    if (!title || !url) continue;
    items.push({
      source: "TurnBackHoax",
      title,
      url,
      rating: plainText(record.status) || null,
      publisher: "TurnBackHoax",
      publishedAt: plainText(record.published_at) || null,
      haystack: `${title} ${plainText(record.description)}`,
    });
  }
  return rankFacts(query, items);
}

export function parseCekfakta(body: string, query: string): ExternalFact[] {
  const rows = extractJsonArray(body, "const responseData = ");
  if (!rows) return [];
  const items: Array<ExternalFact & { haystack: string }> = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const title = plainText(record.title);
    const url = cekfaktaArticleUrl(String(record.id ?? ""));
    if (!title || !url) continue;
    const publisher = plainText(record.authors) || "Cek Fakta";
    items.push({
      source: "Cek Fakta",
      title,
      url,
      rating: plainText(record.status) || null,
      publisher,
      publishedAt: plainText(record.tanggal) || null,
      haystack: `${title} ${plainText(record.content).slice(0, 280)}`,
    });
  }
  return rankFacts(query, items);
}

export function parseAntara(body: string, query: string): ExternalFact[] {
  const pattern = /<a href="(https:\/\/www\.antaranews\.com\/berita\/\d+\/[^"]+)" title="([^"]+)"[\s\S]{0,1200}?<span class="text-dark text-capitalize">([^<]*)<\/span>/gi;
  const items: Array<ExternalFact & { haystack: string }> = [];
  for (const match of body.matchAll(pattern)) {
    const url = match[1].split("?")[0];
    const title = plainText(match[2]);
    if (!/hoaks|cek fakta|cekfakta|klarifikasi/i.test(title)) continue;
    items.push({
      source: "Antara",
      title,
      url,
      rating: /hoaks/i.test(title) ? "Hoaks" : "Cek fakta",
      publisher: "Antara",
      publishedAt: plainText(match[3]) || null,
      haystack: title,
    });
  }
  return rankFacts(query, items);
}

export function parseKomdigi(body: string, query: string): ExternalFact[] {
  if (/access denied/i.test(body.slice(0, 800))) return [];
  const pattern = /<a[^>]+href="(https?:\/\/(?:www\.)?komdigi\.go\.id\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const items: Array<ExternalFact & { haystack: string }> = [];
  for (const match of body.matchAll(pattern)) {
    const title = plainText(match[2]);
    if (!title || !/hoaks|klarifikasi|cek fakta/i.test(title)) continue;
    items.push({
      source: "Komdigi",
      title,
      url: match[1].split("?")[0],
      rating: null,
      publisher: "Komdigi",
      publishedAt: null,
      haystack: title,
    });
  }
  return rankFacts(query, items);
}

export function dedupeFacts(items: ExternalFact[]): ExternalFact[] {
  const seen = new Set<string>();
  const out: ExternalFact[] = [];
  for (const item of items) {
    const key = (item.url || normalizeFactTitle(item.title)).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function sourceFamily(item: { source: string; url?: string | null; publisher?: string | null }): string {
  const blob = `${item.source} ${item.url ?? ""} ${item.publisher ?? ""}`.toLowerCase();
  if (blob.includes("turnbackhoax") || blob.includes("mafindo")) return "TurnBackHoax";
  if (blob.includes("cekfakta") || blob.includes("cek fakta")) return "Cek Fakta";
  if (blob.includes("antaranews") || blob.includes("antara")) return "Antara";
  if (blob.includes("komdigi") || blob.includes("kominfo")) return "Komdigi";
  if (item.publisher?.trim()) return item.publisher.trim();
  return item.source.trim() || "Sumber lain";
}
