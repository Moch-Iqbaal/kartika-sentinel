import { normalizeFactDate } from "./dates";

/** Umur sampai 30 hari tetap bobot penuh. */
export const RECENCY_FRESH_DAYS = 30;
/** Sekitar 6 bulan. Lewat ini bobot tinggal 0,15. */
export const RECENCY_OLD_DAYS = 183;
export const RECENCY_FRESH_WEIGHT = 1;
export const RECENCY_OLD_WEIGHT = 0.15;
/** Tanggal tidak ada: jangan dianggap baru, jangan dianggap sangat lama. */
export const RECENCY_UNKNOWN_WEIGHT = 0.4;
/** Kemiripan ini baru boleh memakai artikel lama sebagai bukti utama. */
export const NEAR_SAME_SIMILARITY = 0.85;

const DAY_MS = 86_400_000;

export function ageInDays(publishedAt: string | null | undefined, reference: Date): number | null {
  const iso = normalizeFactDate(publishedAt);
  if (!iso) return null;
  const published = new Date(`${iso}T12:00:00+07:00`);
  if (Number.isNaN(published.getTime()) || Number.isNaN(reference.getTime())) return null;
  return Math.floor((reference.getTime() - published.getTime()) / DAY_MS);
}

/**
 * Bobot umur.
 * 0–30 hari = 1.
 * 31–182 hari turun lurus dari 1 ke 0,15.
 * 183 hari ke atas = 0,15.
 * Tanpa tanggal = 0,4.
 */
export function recencyWeight(ageDays: number | null): number {
  if (ageDays == null) return RECENCY_UNKNOWN_WEIGHT;
  const age = Math.max(0, ageDays);
  if (age <= RECENCY_FRESH_DAYS) return RECENCY_FRESH_WEIGHT;
  if (age >= RECENCY_OLD_DAYS) return RECENCY_OLD_WEIGHT;
  const span = RECENCY_OLD_DAYS - RECENCY_FRESH_DAYS;
  const progress = (age - RECENCY_FRESH_DAYS) / span;
  return RECENCY_FRESH_WEIGHT - progress * (RECENCY_FRESH_WEIGHT - RECENCY_OLD_WEIGHT);
}

/** Nilai urut = kemiripan × bobot umur. */
export function recencyScore(similarity: number, publishedAt: string | null | undefined, reference: Date): number {
  const sim = Number.isFinite(similarity) ? Math.min(1, Math.max(0, similarity)) : 0;
  return sim * recencyWeight(ageInDays(publishedAt, reference));
}

/** Artikel lama dibanding tanggal berita, atau dibanding hari ini bila berita tak bertanggal. */
export function isOldEvidence(
  publishedAt: string | null | undefined,
  contentPublishedAt: string | null | undefined,
  now: Date,
): boolean {
  const reference = contentPublishedAt ? new Date(`${normalizeFactDate(contentPublishedAt) ?? ""}T12:00:00+07:00`) : now;
  const when = Number.isNaN(reference.getTime()) ? now : reference;
  const age = ageInDays(publishedAt, when);
  return age != null && age >= RECENCY_OLD_DAYS;
}

export function countsAsPrimary(
  similarity: number,
  publishedAt: string | null | undefined,
  contentPublishedAt: string | null | undefined,
  now: Date,
): boolean {
  if (!isOldEvidence(publishedAt, contentPublishedAt, now)) return true;
  return similarity >= NEAR_SAME_SIMILARITY;
}

function unitPhrase(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

export function ageWords(days: number): string {
  if (days <= 0) return "hari ini";
  if (days === 1) return "1 hari lalu";
  if (days < 30) return `${days} hari lalu`;
  const months = Math.max(1, Math.round(days / 30));
  if (months < 12) return `${unitPhrase(months, "bulan", "bulan")} lalu`;
  const years = Math.max(1, Math.round(days / 365));
  return `${unitPhrase(years, "tahun", "tahun")} lalu`;
}

/** Tanggal plus umur. Contoh: "31 Okt 2026, 3 hari lalu". */
export function plainWhen(
  publishedAt: string | null | undefined,
  contentPublishedAt: string | null | undefined,
  now: Date,
): string | null {
  const iso = normalizeFactDate(publishedAt);
  if (!iso) return null;
  const date = new Date(`${iso}T12:00:00+07:00`);
  const label = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(date);
  const contentIso = normalizeFactDate(contentPublishedAt);
  if (contentIso) {
    const content = new Date(`${contentIso}T12:00:00+07:00`);
    const gap = ageInDays(iso, content);
    if (gap != null && gap > 0) {
      return `${label}, ${ageWords(gap).replace(/ lalu$/, "")} lebih tua dari berita ini`;
    }
    if (gap === 0) return `${label}, sama dengan tanggal berita ini`;
    if (gap != null && gap < 0) {
      return `${label}, ${ageWords(-gap).replace(/ lalu$/, "")} lebih baru dari berita ini`;
    }
  }
  const days = ageInDays(iso, now);
  if (days == null) return label;
  return `${label}, ${ageWords(days)}`;
}

/** Nilai lebih tinggi didahulukan. Skor seri: tanggal lebih baru didahulukan. */
export function compareByRecency(
  left: { similarity?: number | null; publishedAt?: string | null },
  right: { similarity?: number | null; publishedAt?: string | null },
  now: Date,
): number {
  const score = recencyScore(right.similarity ?? 0, right.publishedAt, now)
    - recencyScore(left.similarity ?? 0, left.publishedAt, now);
  if (score !== 0) return score;
  return (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "");
}
