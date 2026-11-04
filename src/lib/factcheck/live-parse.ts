import { normalizeFactDate } from "./dates";
import { hasHttpUrl } from "./order";
import { compareByRecency } from "./recency";
import { normalizeFactTitle } from "./turnbackhoax";
import type { ExternalFact } from "./types";

export { normalizeFactDate };

/** Konteks isi untuk skor entitas saat parse RSS/pencarian berita. */
let peerContentContext = "";
export function setPeerContentContext(text: string): void {
  peerContentContext = text || "";
}
export function getPeerContentContext(): string {
  return peerContentContext;
}


const STOP = new Set([
  "yang", "dan", "di", "ke", "dari", "untuk", "ini", "itu", "dengan", "pada", "ada", "adalah",
  "atau", "juga", "tidak", "tak", "sudah", "telah", "akan", "oleh", "sebagai", "para", "sebuah",
  "dalam", "saat", "agar", "karena", "kalau", "jika", "lebih", "sangat", "bisa", "dapat", "atas",
  "serta", "bagi", "hanya", "masih", "lalu", "nya", "ya", "video", "klaim", "berita", "hoaks",
  "hoax", "salah", "benar", "cek", "fakta", "menurut", "bahwa", "tersebut",   "orang", "tahun", "bila", "sebarkan", "bagikan", "viralkan", "wajib",
]);

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
/**
 * Dua atau tiga frasa klaim. Bukan hanya judul.
 * Frasa pertama tetap yang paling khas. Berikutnya entitas atau sisa kata.
 */

/** URL artikel dulu, lalu judul baris pertama, baru frasa klaim. */
export function urlFirstQueries(text: string, sourceUrl?: string | null): string[] {
  const out: string[] = [];
  const url = (sourceUrl ?? "").trim();
  if (/^https?:\/\//i.test(url)) {
    out.push(url);
    try {
      const parsed = new URL(url);
      if (parsed.hostname && !/youtube|youtu\.be|google\./i.test(parsed.hostname)) {
        out.push(parsed.hostname.replace(/^www\./, ""));
      }
    } catch { /* ignore */ }
  }
  const firstLine = text.split(/\n/).map((line) => line.trim()).find((line) => line.length >= 12 && !/^Kanal:/i.test(line));
  if (firstLine) out.push(firstLine.slice(0, 120));
  out.push(...claimQueries(text));
  return [...new Set(out.map((item) => item.trim()).filter(Boolean))].slice(0, 5);
}

export function claimQueries(text: string): string[] {
  const stripped = text.replace(/(?:^|\n)\s*Kanal:\s*.+/g, " ");
  const primary = factQuery(stripped);
  const normalized = stripped
    .replace(/\b(\d{1,3})\.000\b/g, "$1 ribu")
    .replace(/\b(\d{2,3})000\b/g, "$1 ribu");
  const queries = [primary];
  const uniqueEntities = extractEntities(normalized);
  if (uniqueEntities.length >= 2) queries.push(uniqueEntities.slice(0, 3).join(" "));
  const used = new Set(primary.split(" "));
  const rest = contentTokens(normalized).filter((word) => !BROAD.has(word) && !used.has(word) && !/^(me|di|ter|ber|mem|men|meng|per)/.test(word));
  if (rest.length >= 2) queries.push(rest.slice(0, 3).join(" "));
  return [...new Set(queries.map((query) => query.trim()).filter((query) => query.split(/\s+/).length >= 2))].slice(0, 3);
}

/** Kata judul yang terlalu generik untuk entitas. */
const ENTITY_NOISE = new Set([
  "eks", "mantan", "resmi", "jadi", "kasus", "soal", "tentang", "terkait", "ungkap", "sebut",
  "klaim", "video", "foto", "berita", "breaking", "update", "live", "hari", "ini", "itu",
  "tersangka", "ditetapkan", "menjadi", "sebagai", "atas", "dalam", "pada", "oleh", "untuk",
  "dan", "atau", "dari", "dengan", "yang", "para", "sebuah", "seorang", "antara", "karena",
  "setelah", "sebelum", "hingga", "sampai", "masih", "sudah", "akan", "bisa", "dapat",
  "jakarta", "indonesia", "nasional", "politik", "hukum",
  "dikabarkan", "beredar", "pesan", "grup", "membantu", "warga", "membangun", "desa",
  "perwira", "memeriksa", "isu", "dini", "operasi", "senyap",
]);

/** Nama, lembaga, inisial, dan angka khas dari judul/lead — bukan seluruh teks. */
export function extractEntities(text: string): string[] {
  const head = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 8 && !/^Kanal:/i.test(line) && !/^https?:\/\//i.test(line))
    .slice(0, 4)
    .join("\n");
  const normalized = head
    .replace(/\b(\d{1,3})\.000\b/g, "$1 ribu")
    .replace(/\b(\d{2,3})000\b/g, "$1 ribu");
  const found: string[] = [];
  for (const match of normalized.matchAll(/\b\d{1,3}\s+ribu\b/gi)) found.push(match[0].toLowerCase());
  // Inisial/ALLCAPS lembaga (TNI, POLRI, LSP) tetap diambil meski ada di BROAD.
  for (const match of normalized.matchAll(/\b[A-ZÀ-Ž]{2,}\b/g)) found.push(match[0].toLowerCase());

  // Token kapital satu per satu (judul ID sering Title Case semua kata).
  const caps = [...normalized.matchAll(/\b[A-ZÀ-Ž][A-Za-zÀ-ž]{2,}\b/g)].map((m) => m[0].toLowerCase());
  const distinctive = caps.filter((word) => !STOP.has(word) && !ENTITY_NOISE.has(word) && !BROAD.has(word));
  for (const word of distinctive) found.push(word);

  // Pasangan nama berurutan dari token khas, mis. "listyo sigit".
  for (let i = 0; i < distinctive.length - 1; i += 1) {
    found.push(`${distinctive[i]} ${distinctive[i + 1]}`);
  }

  const out: string[] = [];
  for (const item of found) {
    const clean = item.replace(/\s+/g, " ").trim();
    if (clean.length < 3) continue;
    if (STOP.has(clean) || ENTITY_NOISE.has(clean)) continue;
    const parts = clean.split(/\s+/);
    // BROAD single-token dibuang kecuali inisial lembaga pendek (tni/polri/lsp/dpr).
    if (parts.length === 1 && BROAD.has(clean) && clean.length > 4) continue;
    if (parts.every((word) => STOP.has(word) || ENTITY_NOISE.has(word))) continue;
    if (!out.includes(clean)) out.push(clean);
  }
  // Utamakan frasa 2 kata lalu token tunggal.
  out.sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length || a.length - b.length);
  return out.slice(0, 8);
}

function titleLine(text: string): string | null {
  const line = text
    .split(/\n+/)
    .map((item) => item.trim())
    .find((item) => item.length >= 12 && !/^Kanal:/i.test(item) && !/^https?:\/\//i.test(item) && !/^[A-Z0-9.]+,\s/i.test(item));
  return line ? line.replace(/\s+/g, " ").slice(0, 120) : null;
}

/**
 * Kueri penguat berita: judul, entitas utama, frasa dikutip.
 * Dipakai Google News dan pencarian berita — bukan seluruh badan artikel.
 */
export function peerQueries(text: string): string[] {
  const title = titleLine(text);
  const entities = extractEntities(text);
  const pairs = entities.filter((item) => item.includes(" "));
  const singles = entities.filter((item) => !item.includes(" "));
  const out: string[] = [];
  if (title) out.push(title);
  if (pairs.length >= 1) {
    const key = pairs[0];
    const extra = singles.filter((word) => !key.includes(word)).slice(0, 2);
    out.push([key, ...extra].join(" ").trim());
    out.push(`"${key}"`);
  } else if (singles.length >= 2) {
    out.push(singles.slice(0, 3).join(" "));
    out.push(`"${singles.slice(0, 2).join(" ")}"`);
  } else if (entities.length === 1 && title) {
    out.push(`${entities[0]} ${title.split(/\s+/).slice(0, 3).join(" ")}`);
  }
  for (const claim of claimQueries(text)) {
    if (!out.includes(claim)) out.push(claim);
  }
  return [...new Set(out.map((item) => item.trim()).filter((item) => item.length >= 6))].slice(0, 4);
}

/** Varian Google News dengan jendela 7 hari. */
export function googleNewsQueries(text: string): string[] {
  return peerQueries(text).slice(0, 3).map((query) => {
    const base = query.replace(/\s+when:\S+/gi, "").trim();
    return `${base} when:7d`;
  });
}

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

const OUTLET_WORDS = new Set([
  "kompas", "kompastv", "detik", "tempo", "antara", "liputan", "liputan6", "tirto",
  "kumparan", "tribun", "tribunnews", "republika", "metrotv", "tvone", "cnnindonesia",
]);

export function relevantHit(query: string, haystack: string): boolean {
  const queryWords = claimWords(query);
  if (queryWords.length < 2) return false;
  const haystackWords = new Set(contentTokens(haystack).filter((word) => !OUTLET_WORDS.has(word)));
  const shared = [...new Set(queryWords.filter((word) => haystackWords.has(word)))];
  const need = queryWords.length <= 2 ? queryWords.length : Math.max(2, Math.ceil(queryWords.length * 0.6));
  return shared.length >= need;
}

function claimWords(query: string): string[] {
  const cleaned = query
    .replace(/\s+when:\S+/gi, " ")
    .replace(/"/g, " ");
  return contentTokens(cleaned).filter((word) => !OUTLET_WORDS.has(word) && word !== "when");
}

/** Bagian kata klaim yang sama. 1 artinya seluruh frasa ada di artikel. */
export function keywordSimilarity(query: string, haystack: string): number {
  const queryWords = [...new Set(claimWords(query))];
  if (queryWords.length === 0) return 0;
  const haystackWords = new Set(contentTokens(haystack).filter((word) => !OUTLET_WORDS.has(word)));
  const shared = queryWords.filter((word) => haystackWords.has(word)).length;
  return Math.min(1, shared / queryWords.length);
}

/**
 * Kemiripan berbasis entitas (nama/lembaga/angka) agar parafrase judul tetap cocok.
 * Tetap ada lantai lewat keywordSimilarity di peerSimilarity.
 */
export function entitySimilarity(content: string, title: string): number {
  const entities = extractEntities(content);
  if (entities.length === 0) return 0;
  const hay = title.toLowerCase();
  const hayTokens = new Set(contentTokens(title));
  // Token khas unik dari entitas (nama/lembaga), bukan seluruh frasa noise.
  const tokens = [...new Set(
    entities.flatMap((entity) => entity.split(/\s+/))
      .filter((word) => {
        if (STOP.has(word) || ENTITY_NOISE.has(word)) return false;
        // Inisial 2-3 huruf (lsp/wa) terlalu mudah salah cocok; izinkan lembaga 3 huruf dikenal.
        if (word.length <= 3) return word === "tni" || word === "dpr" || word === "tniad";
        return word.length >= 4;
      }),
  )].slice(0, 6);
  if (tokens.length === 0) return 0;
  let hits = 0;
  for (const token of tokens) {
    if (hayTokens.has(token) || hay.includes(token)) hits += 1;
  }
  // Frasa 2+ kata yang utuh mendapat bonus kecil.
  for (const entity of entities) {
    if (entity.includes(" ") && hay.includes(entity)) {
      hits += 0.25;
      break;
    }
  }
  const score = hits / Math.max(tokens.length, 2);
  // Lantai: minimal 2 token khas sama, atau 1 frasa nama utuh + 1 token.
  if (hits < 1.25 && tokens.length >= 2) return Math.min(score, 0.35);
  return Math.min(1, score);
}

/**
 * Skor penguat berita.
 * Parafrase judul lolos lewat entitas. Kata kunci saja tidak cukup bila entitas tidak saling tutup,
 * supaya teks pendek/rumor tidak ikut FAKTA dari berita topik longgar.
 */
export function peerSimilarity(query: string, content: string, title: string): number {
  const cleaned = query.replace(/\s+when:\S+/gi, " ").replace(/"/g, " ");
  const kw = keywordSimilarity(cleaned, title);
  const source = content || cleaned;
  const compact = source.replace(/\s+/g, " ").trim();
  const ent = entitySimilarity(source, title);
  let score = 0;
  if (ent >= 0.4) score = Math.max(ent, kw);
  else {
    const queryWords = cleaned.trim().split(/\s+/).filter(Boolean);
    // Judul penuh hanya untuk teks berita cukup panjang — teks pendek/rumor tidak boleh
    // lolos lewat keyword longgar ke berita militer lain.
    const looksLikeTitle = queryWords.length >= 6 && compact.length >= 220;
    if (looksLikeTitle && kw >= 0.55) score = kw;
    else if (kw >= 0.7 && ent >= 0.3) score = Math.min(kw, 0.75);
    else score = Math.min(0.35, Math.max(kw, ent));
  }
  // Klaim pendek: harus hampir sama (bukan sekadar nama satuan/lembaga).
  if (compact.length < 220) {
    if (score < 0.7) return Math.min(0.35, score);
    const unitish = /^(yonif|yonta|kodim|korem|batalyon|divisi|brigif|kostrad|paspampres|tni|polri|\d+)$/;
    const titleTok = new Set(contentTokens(title));
    const topical = contentTokens(compact).filter(
      (word) => titleTok.has(word) && !unitish.test(word) && !BROAD.has(word) && !ENTITY_NOISE.has(word),
    );
    // Tanpa kata topik bersama (jembatan/membantu/dll) nama satuan saja tidak cukup.
    if (topical.length < 1) return Math.min(0.35, score);
  }
  return score;
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

type Ranked = ExternalFact & { similarity: number };

function rankFacts(
  query: string,
  items: Array<ExternalFact & { haystack: string }>,
  now = new Date(),
  contentForEntities?: string,
): ExternalFact[] {
  const ranked: Ranked[] = [];
  const entitySource = contentForEntities || query;
  for (const item of items) {
    if (!item.title.trim()) continue;
    // Entitas dari isi boleh menyelamatkan parafrase judul; tetap butuh 1 token khas.
    const byKeyword = relevantHit(query, item.haystack);
    const byEntity = entitySimilarity(entitySource, item.title) >= 0.4;
    if (!byKeyword && !byEntity) continue;
    const url = item.url && hasHttpUrl(item.url) ? item.url : null;
    ranked.push({
      ...item,
      url,
      publishedAt: normalizeFactDate(item.publishedAt),
      similarity: peerSimilarity(query, entitySource, item.title),
    });
  }
  ranked.sort((left, right) => compareByRecency(left, right, now));
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
      publishedAt: item.publishedAt,
      similarity: item.similarity,
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

export function parseKompasSearch(body: string, query: string): ExternalFact[] {
  const pattern = /href="(https:\/\/www\.kompas\.com\/cekfakta\/read\/(\d{4})\/(\d{2})\/(\d{2})\/[^"]+)"[\s\S]{0,800}?alt="([^"]+)"/gi;
  const items: Array<ExternalFact & { haystack: string }> = [];
  for (const match of body.matchAll(pattern)) {
    const title = plainText(match[5]);
    if (!/hoaks|cek fakta|cekfakta|klarifikasi|fakta/i.test(title)) continue;
    items.push({
      source: "Kompas Cek Fakta",
      title,
      url: match[1].split("?")[0],
      rating: /hoaks/i.test(title) ? "Hoaks" : "Cek fakta",
      publisher: "Kompas",
      publishedAt: `${match[2]}-${match[3]}-${match[4]}`,
      haystack: title,
    });
  }
  return rankFacts(query, items);
}

export function parseDetikSearch(body: string, query: string): ExternalFact[] {
  const pattern = /href="(https:\/\/[^"]*detik\.com\/[^"]+\/d-\d+\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const items: Array<ExternalFact & { haystack: string }> = [];
  for (const match of body.matchAll(pattern)) {
    const title = plainText(match[2]);
    if (title.length < 12 || !/hoaks|cek fakta|klarifikasi/i.test(title)) continue;
    items.push({
      source: "Detik",
      title,
      url: match[1],
      rating: /hoaks/i.test(title) ? "Hoaks" : "Cek fakta",
      publisher: "Detik",
      publishedAt: null,
      haystack: title,
    });
  }
  return rankFacts(query, items);
}

export function parseLiputanRss(body: string, query: string): ExternalFact[] {
  const pattern = /<item\b[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>[\s\S]*?<link>([^<]+)<\/link>/gi;
  const items: Array<ExternalFact & { haystack: string }> = [];
  for (const match of body.matchAll(pattern)) {
    const title = plainText(match[1]);
    const url = match[2].trim();
    if (!title || !/^https?:\/\//.test(url)) continue;
    if (!/liputan6\.com\/cek-fakta/i.test(url) && !/hoaks|cek fakta/i.test(title)) continue;
    items.push({
      source: "Liputan6 Cek Fakta",
      title,
      url: url.split("?")[0],
      rating: /hoaks/i.test(title) ? "Hoaks" : "Cek fakta",
      publisher: "Liputan6",
      publishedAt: null,
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
  return rankFacts(query, items, new Date(), peerContentContext);
}


/** Pencarian Antara untuk berita biasa (bukan hanya cek fakta). */
export function parseAntaraNews(body: string, query: string): ExternalFact[] {
  const pattern = /<a href="(https:\/\/www\.antaranews\.com\/berita\/\d+\/[^"]+)" title="([^"]+)"[\s\S]{0,1200}?<span class="text-dark text-capitalize">([^<]*)<\/span>/gi;
  const items: Array<ExternalFact & { haystack: string }> = [];
  for (const match of body.matchAll(pattern)) {
    const url = match[1].split("?")[0];
    const title = plainText(match[2]);
    if (!title || title.length < 12) continue;
    if (/hoaks|cek fakta|cekfakta/i.test(title)) continue;
    items.push({
      source: "Antara",
      title,
      url,
      rating: "Berita",
      publisher: "Antara",
      publishedAt: plainText(match[3]) || null,
      haystack: title,
    });
  }
  return rankFacts(query, items, new Date(), peerContentContext);
}

/** Pencarian Detik untuk berita biasa. */
export function parseDetikNews(body: string, query: string): ExternalFact[] {
  const pattern = /href="(https:\/\/[^"]*detik\.com\/[^"]+\/d-\d+\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const items: Array<ExternalFact & { haystack: string }> = [];
  for (const match of body.matchAll(pattern)) {
    const title = plainText(match[2]);
    const url = match[1];
    if (title.length < 12) continue;
    if (/\/cek.?fakta\//i.test(url) || /hoaks|cek fakta|klarifikasi/i.test(title)) continue;
    items.push({
      source: "Detik",
      title,
      url,
      rating: "Berita",
      publisher: "Detik",
      publishedAt: null,
      haystack: title,
    });
  }
  return rankFacts(query, items, new Date(), peerContentContext);
}

/** Pencarian Kompas untuk berita biasa (bukan rubrik cekfakta). */
export function parseKompasNews(body: string, query: string): ExternalFact[] {
  const pattern = /href="(https:\/\/(?:www\.|nasional\.|regional\.|money\.|tekno\.)?kompas\.com\/(?!cekfakta)[^"]+\/read\/(\d{4})\/(\d{2})\/(\d{2})\/[^"]+)"[\s\S]{0,900}?(?:alt|title)="([^"]+)"/gi;
  const items: Array<ExternalFact & { haystack: string }> = [];
  for (const match of body.matchAll(pattern)) {
    const title = plainText(match[5]);
    if (!title || title.length < 12) continue;
    if (/hoaks|cek fakta|cekfakta/i.test(title)) continue;
    items.push({
      source: "Kompas",
      title,
      url: match[1].split("?")[0],
      rating: "Berita",
      publisher: "Kompas",
      publishedAt: `${match[2]}-${match[3]}-${match[4]}`,
      haystack: title,
    });
  }
  return rankFacts(query, items, new Date(), peerContentContext);
}



/** RSS generik: Tempo, Tirto, Kumparan, Google News. */
export function parseGenericNewsRss(
  body: string,
  query: string,
  source: string,
  publisher: string,
  options?: { requireFactCue?: boolean },
): ExternalFact[] {
  const requireFactCue = options?.requireFactCue ?? false;
  const itemPattern = /<item\b[\s\S]*?<\/item>/gi;
  const items: Array<ExternalFact & { haystack: string }> = [];
  for (const raw of body.matchAll(itemPattern)) {
    const chunk = raw[0];
    const title = plainText(chunk.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] ?? "");
    const link = (chunk.match(/<link>([^<]+)<\/link>/i)?.[1]
      ?? chunk.match(/<link[^>]+href="([^"]+)"/i)?.[1]
      ?? "").trim();
    const pub = plainText(chunk.match(/<pubDate>([^<]+)<\/pubDate>/i)?.[1] ?? "");
    const sourceTag = chunk.match(/<source[^>]*url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/i);
    const outletUrl = sourceTag?.[1]?.trim() ?? "";
    const outletName = plainText(sourceTag?.[2] ?? "") || publisher;
    if (!title || title.length < 8) continue;
    if (requireFactCue && !/hoaks|hoax|cek fakta|klarifikasi|salah|keliru/i.test(title)) continue;
    const url = (/^https?:\/\//.test(link) ? link : outletUrl).split("?")[0] || null;
    if (!url) continue;
    items.push({
      source,
      title,
      url,
      rating: /hoaks|hoax|salah|keliru/i.test(title) ? "Hoaks" : "Berita",
      publisher: outletName,
      publishedAt: pub || null,
      haystack: title,
    });
  }
  return rankFacts(query, items, new Date(), peerContentContext);
}

export function parseGoogleNewsRss(body: string, query: string): ExternalFact[] {
  const itemPattern = /<item\b[\s\S]*?<\/item>/gi;
  const items: Array<ExternalFact & { haystack: string }> = [];
  for (const raw of body.matchAll(itemPattern)) {
    const chunk = raw[0];
    const title = plainText(chunk.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] ?? "");
    const link = (chunk.match(/<link>([^<]+)<\/link>/i)?.[1] ?? "").trim();
    const pub = plainText(chunk.match(/<pubDate>([^<]+)<\/pubDate>/i)?.[1] ?? "");
    const sourceTag = chunk.match(/<source[^>]*url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/i);
    const outletUrl = (sourceTag?.[1] ?? "").trim();
    const outletName = plainText(sourceTag?.[2] ?? "") || "Google News";
    if (!title || title.length < 8) continue;
    // Prefer outlet root for host matching; keep Google link as fallback.
    const url = (/^https?:\/\//.test(outletUrl) ? outletUrl : link).split("?")[0] || null;
    if (!url) continue;
    items.push({
      source: "Google News",
      title,
      url,
      rating: "Berita",
      publisher: outletName,
      publishedAt: pub || null,
      haystack: title,
    });
  }
  return rankFacts(query, items, new Date(), peerContentContext);
}

export function parseTempoRss(body: string, query: string): ExternalFact[] {
  return parseGenericNewsRss(body, query, "Tempo", "Tempo", { requireFactCue: false });
}

export function parseTirtoRss(body: string, query: string): ExternalFact[] {
  return parseGenericNewsRss(body, query, "Tirto", "Tirto", { requireFactCue: false });
}

export function parseKumparanRss(body: string, query: string): ExternalFact[] {
  return parseGenericNewsRss(body, query, "Kumparan", "Kumparan", { requireFactCue: false });
}

export function dedupeFacts(items: ExternalFact[], now = new Date()): ExternalFact[] {
  const best = new Map<string, ExternalFact>();
  for (const item of items) {
    const key = (item.url || normalizeFactTitle(item.title)).toLowerCase();
    if (!key) continue;
    const existing = best.get(key);
    if (!existing || compareByRecency(existing, item, now) > 0) best.set(key, item);
  }
  return [...best.values()].sort((left, right) => compareByRecency(left, right, now));
}

export function sourceFamily(item: { source: string; url?: string | null; publisher?: string | null }): string {
  const blob = `${item.source} ${item.url ?? ""} ${item.publisher ?? ""}`.toLowerCase();
  if (blob.includes("turnbackhoax") || blob.includes("mafindo")) return "TurnBackHoax";
  if (blob.includes("kompas")) return "Kompas";
  if (blob.includes("detik")) return "Detik";
  if (blob.includes("liputan")) return "Liputan6";
  if (blob.includes("tempo")) return "Tempo";
  if (blob.includes("tirto")) return "Tirto";
  if (blob.includes("kumparan")) return "Kumparan";
  if (blob.includes("antaranews") || blob.includes("antara")) return "Antara";
  if (blob.includes("cekfakta") || blob.includes("cek fakta")) return "Cek Fakta";
  if (blob.includes("komdigi") || blob.includes("kominfo")) return "Komdigi";
  if (item.publisher?.trim()) return item.publisher.trim();
  return item.source.trim() || "Sumber lain";
}
