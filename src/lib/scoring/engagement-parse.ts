import { clamp01, VIRALITY_ENGAGEMENT_CEILING, VIRALITY_LIKE_WEIGHT, VIRALITY_COMMENT_WEIGHT } from "./risk";

/**
 * Angka sebaran yang dibaca dari teks (bukan ditebak).
 * Langit normalisasi 20.000 = dibulatkan dari rata-rata tayangan TikTok
 * pada studi short-form Metricool 2024 (±18.173 views).
 * Sumber: https://metricool.com/short-form-video-study/
 * Viralitas di sini indikator relatif terhadap langit itu, bukan klaim
 * "viral dunia nyata".
 */
export const ENGAGEMENT_CEILING_SOURCE =
  "Metricool Short-Form Video Study 2024 — rata-rata tayangan TikTok ±18.173 (langit dibulatkan 20.000). https://metricool.com/short-form-video-study/";

export type ParsedEngagement = {
  views: number;
  likes: number;
  shares: number;
  comments: number;
  /** True bila minimal satu angka valid terbaca dari teks. */
  found: boolean;
  /** Kalimat biasa untuk kartu, mis. "sudah dilihat ±77.900 kali". */
  plainLabel: string | null;
};

const SUFFIX: Record<string, number> = {
  k: 1_000,
  rb: 1_000,
  ribu: 1_000,
  m: 1_000_000,
  jt: 1_000_000,
  juta: 1_000_000,
};

/**
 * Baca angka dengan akhiran K/M/rb/jt atau pemisah ribuan.
 * Contoh: 77.9K → 77900; 1,2jt → 1_200_000; 12.345 → 12345.
 */
export function parseCountToken(raw: string): number | null {
  const token = raw.trim().replace(/\s+/g, "");
  if (!token) return null;
  const match = token.match(/^([\d.,]+)\s*(k|m|rb|ribu|jt|juta)?$/i);
  if (!match) return null;
  const suffix = (match[2] ?? "").toLowerCase();
  let digits = match[1];
  if (suffix) {
    // Desimal Eropa/Indonesia: 77.9K atau 77,9K
    digits = digits.replace(",", ".");
    const value = Number(digits);
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value * (SUFFIX[suffix] ?? 1));
  }
  // Tanpa akhiran: 12.345 atau 12,345 = dua belas ribu; 12.3 ambigu → tolak bila satu desimal
  if (/^\d{1,3}([.,]\d{3})+$/.test(digits)) {
    return Number(digits.replace(/[.,]/g, ""));
  }
  if (/^\d+$/.test(digits)) {
    return Number(digits);
  }
  return null;
}

type Bucket = "views" | "likes" | "shares" | "comments";

const VIEW_WORDS = "views?|view|dilihat|ditonton|tayangan|impresi|impressions?|penonton";
const LIKE_WORDS = "likes?|like|suka|favorites?|favourites?|reaksi|reactions?";
const SHARE_WORDS = "reposts?|repost|retweets?|retweet|shares?|share|sebaran|dibagikan|rt\\b";
const COMMENT_WORDS = "comments?|comment|komentar|replies|reply|balasan";

function takeMax(current: number, next: number | null): number {
  if (next == null || !Number.isFinite(next) || next < 0) return current;
  return Math.max(current, Math.round(next));
}

function scanPairs(text: string, pattern: RegExp, bucket: Bucket, out: ParsedEngagement): void {
  pattern.lastIndex = 0;
  let hit: RegExpExecArray | null;
  while ((hit = pattern.exec(text)) != null) {
    const num = parseCountToken(hit[1] ?? hit[2] ?? "");
    if (num == null) continue;
    if (bucket === "views") out.views = takeMax(out.views, num);
    else if (bucket === "likes") out.likes = takeMax(out.likes, num);
    else if (bucket === "shares") out.shares = takeMax(out.shares, num);
    else out.comments = takeMax(out.comments, num);
  }
}

/**
 * Ambil angka sebaran dari teks yang dinilai (salinan unggahan, caption, dsb.).
 * Hanya angka yang benar-benar tertulis — tidak mengarang.
 */
export function parseEngagement(text: string): ParsedEngagement {
  const out: ParsedEngagement = {
    views: 0,
    likes: 0,
    shares: 0,
    comments: 0,
    found: false,
    plainLabel: null,
  };
  if (!text || !text.trim()) return out;
  const source = text;

  // "77.9K Views" / "143.9K Views 38" / "12rb dilihat"
  scanPairs(
    source,
    new RegExp(`([\\d.,]+\\s*(?:k|m|rb|ribu|jt|juta)?)\\s*(?:${VIEW_WORDS})\\b`, "gi"),
    "views",
    out,
  );
  scanPairs(
    source,
    new RegExp(`(?:${VIEW_WORDS})\\s*[:=]?\\s*([\\d.,]+\\s*(?:k|m|rb|ribu|jt|juta)?)`, "gi"),
    "views",
    out,
  );
  // YouTube-style "1.2M views"
  scanPairs(
    source,
    new RegExp(`([\\d.,]+\\s*(?:k|m|rb|ribu|jt|juta))\\s+(?:${VIEW_WORDS})\\b`, "gi"),
    "views",
    out,
  );


  // "Ditonton 2,3jt kali" / "dilihat 15rb kali"
  scanPairs(
    source,
    /(?:ditonton|dilihat|tayangan)\s+([\d.,]+\s*(?:k|m|rb|ribu|jt|juta)?)(?:\s*kali)?/gi,
    "views",
    out,
  );

  scanPairs(
    source,
    new RegExp(`([\\d.,]+\\s*(?:k|m|rb|ribu|jt|juta)?)\\s*(?:${LIKE_WORDS})\\b`, "gi"),
    "likes",
    out,
  );
  scanPairs(
    source,
    new RegExp(`(?:${LIKE_WORDS})\\s*[:=]?\\s*([\\d.,]+\\s*(?:k|m|rb|ribu|jt|juta)?)`, "gi"),
    "likes",
    out,
  );

  scanPairs(
    source,
    new RegExp(`([\\d.,]+\\s*(?:k|m|rb|ribu|jt|juta)?)\\s*(?:${SHARE_WORDS})`, "gi"),
    "shares",
    out,
  );
  scanPairs(
    source,
    new RegExp(`(?:${SHARE_WORDS})\\s*[:=]?\\s*([\\d.,]+\\s*(?:k|m|rb|ribu|jt|juta)?)`, "gi"),
    "shares",
    out,
  );

  scanPairs(
    source,
    new RegExp(`([\\d.,]+\\s*(?:k|m|rb|ribu|jt|juta)?)\\s*(?:${COMMENT_WORDS})\\b`, "gi"),
    "comments",
    out,
  );
  scanPairs(
    source,
    new RegExp(`(?:${COMMENT_WORDS})\\s*[:=]?\\s*([\\d.,]+\\s*(?:k|m|rb|ribu|jt|juta)?)`, "gi"),
    "comments",
    out,
  );

  out.found = out.views > 0 || out.likes > 0 || out.shares > 0 || out.comments > 0;
  if (!out.found) return out;

  const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);
  if (out.views > 0) {
    out.plainLabel = `sudah dilihat ±${fmt(out.views)} kali`;
  } else {
    const parts: string[] = [];
    if (out.shares > 0) parts.push(`${fmt(out.shares)} sebar`);
    if (out.likes > 0) parts.push(`${fmt(out.likes)} suka`);
    if (out.comments > 0) parts.push(`${fmt(out.comments)} komentar`);
    out.plainLabel = `tercatat ${parts.join(", ")}`;
  }
  return out;
}

/**
 * Viralitas 0–1 dari angka yang terbaca.
 * Bila ada tayangan/views, itu yang dipakai lawan langit 20.000 (log1p),
 * karena studi acuan memakai rata-rata views. Bila tidak ada views,
 * jatuh ke rumus sebar+suka+komentar yang sama dengan viralityFromMetrics
 * untuk satu titik (tanpa kecepatan, karena teks tidak punya dua waktu).
 */
export function viralityFromEngagement(parsed: ParsedEngagement): number {
  if (!parsed.found) return 0;
  if (parsed.views > 0) {
    return clamp01(Math.log1p(parsed.views) / Math.log1p(VIRALITY_ENGAGEMENT_CEILING));
  }
  const engagement =
    parsed.shares + VIRALITY_LIKE_WEIGHT * parsed.likes + VIRALITY_COMMENT_WEIGHT * parsed.comments;
  return clamp01(Math.log1p(engagement) / Math.log1p(VIRALITY_ENGAGEMENT_CEILING));
}
