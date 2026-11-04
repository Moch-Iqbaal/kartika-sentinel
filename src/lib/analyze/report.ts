import {
  metricLine,
  plainBand,
  SCORE_MEANING,
  SENSITIVITY_MEANING,
  VIRALITY_MEANING,
  type PlainBand,
} from "./bands";
import { sourceFamily } from "../factcheck/live-parse";
import { hasHttpUrl } from "../factcheck/order";
import { publicSourceName } from "../factcheck/public-name";
import { countsAsPrimary, isOldEvidence, plainWhen } from "../factcheck/recency";
import type { ExternalFact, FactMatch } from "../factcheck/types";

export type EvidenceBullet = {
  text: string;
  href: string | null;
};

export type ScoreLines = {
  utama: string;
  utamaBand: PlainBand;
  sensitivitas: string;
  sensitivitasBand: PlainBand;
  viralitas: string;
  viralitasBand: PlainBand;
};

const NONE = "Belum ada sumber lain yang memberitakan.";

export function scoreLines(
  hoax: number,
  sensitivity: number,
  virality: number,
  engagementLabel?: string | null,
): ScoreLines {
  // Tanpa angka sebaran: jangan tampilkan 0% yang menyesatkan.
  const noSpread = !(Number.isFinite(virality) && virality > 0) && !engagementLabel;
  const viralitas = noSpread
    ? "Viralitas: belum ada data sebaran"
    : metricLine(
        "Viralitas",
        virality,
        engagementLabel || VIRALITY_MEANING,
      );
  return {
    utama: metricLine("Skor utama", hoax, SCORE_MEANING),
    utamaBand: plainBand(hoax),
    sensitivitas: metricLine("Sensitivitas", sensitivity, SENSITIVITY_MEANING),
    sensitivitasBand: plainBand(sensitivity),
    viralitas,
    viralitasBand: noSpread ? "rendah" : plainBand(virality),
  };
}

export function plainTopicLine(labels: string[]): string {
  const clean: string[] = [];
  for (const label of labels) {
    const text = label.trim();
    if (!text) continue;
    if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(text)) continue;
    if (!clean.includes(text)) clean.push(text);
  }
  if (clean.length === 0) return "Tidak ada topik yang cukup kuat.";
  if (clean.length === 1) return `Topik: ${clean[0]}.`;
  return `Topik: ${clean[0]}. Juga: ${clean[1]}.`;
}

function displaySource(item: ExternalFact): string {
  const family = sourceFamily(item);
  if (family === "Cek Fakta" && item.publisher && !/cek fakta/i.test(item.publisher)) {
    return `Cek Fakta · ${item.publisher}`;
  }
  if (family === "Antara") return "Antara";
  if (family === "TurnBackHoax") return "TurnBackHoax";
  if (family === "Komdigi") return "Komdigi";
  return item.publisher?.trim() || item.source.trim() || family;
}

function whenLabel(
  publishedAt: string | null | undefined,
  contentPublishedAt: string | null | undefined,
  now: Date,
): string | null {
  return plainWhen(publishedAt, contentPublishedAt, now);
}

function stale(item: { similarity?: number | null; publishedAt?: string | null }, contentPublishedAt: string | null | undefined, now: Date): boolean {
  return isOldEvidence(item.publishedAt, contentPublishedAt, now)
    && !countsAsPrimary(item.similarity ?? 0, item.publishedAt, contentPublishedAt, now);
}

function factBullet(item: ExternalFact, contentPublishedAt: string | null | undefined, now: Date): EvidenceBullet {
  const when = whenLabel(item.publishedAt, contentPublishedAt, now);
  const name = displaySource(item);
  const head = when ? `${name}, ${when}` : name;
  const prefix = stale(item, contentPublishedAt, now) ? "Artikel lama. " : "";
  return {
    text: `${prefix}${head}: ${item.title}`,
    href: item.url && hasHttpUrl(item.url) ? item.url : null,
  };
}

function corpusBullet(item: FactMatch, contentPublishedAt: string | null | undefined, now: Date): EvidenceBullet {
  const when = whenLabel(item.publishedAt, contentPublishedAt, now);
  const source = publicSourceName(item.source);
  const head = when ? `${source}, ${when}` : source;
  return {
    text: `Artikel lama. ${head}: ${item.title}`,
    href: item.url && hasHttpUrl(item.url) ? item.url : null,
  };
}

function pickSources(items: ExternalFact[]): ExternalFact[] {
  const picked: ExternalFact[] = [];
  const families = new Set<string>();
  for (const item of items) {
    const family = sourceFamily(item);
    if (families.has(family)) continue;
    families.add(family);
    picked.push(item);
    if (picked.length >= 2) break;
  }
  return picked;
}

/**
 * Paling banyak tiga butir. Sumber yang memberitakan hal yang sama didahulukan.
 * Nama mesin tidak ditulis di sini.
 */
export function buildEvidence(input: {
  unscored: boolean;
  hoaxScore: number;
  engine: string;
  live: ExternalFact[];
  corroboration?: { name: string; href: string | null; primary?: boolean; publishedAt?: string | null; similarity?: number }[];
  corpus?: FactMatch[];
  contentPublishedAt?: string | null;
  now?: Date;
}): EvidenceBullet[] {
  if (input.unscored) {
    return [{ text: "Tidak ada teks yang bisa dinilai.", href: null }];
  }
  const now = input.now ?? new Date();
  const contentPublishedAt = input.contentPublishedAt ?? null;
  const corroboration = input.corroboration ?? [];
  const lead: EvidenceBullet[] = corroboration
    .filter((item) => item.primary !== false)
    .map((item) => ({
      text: `${item.name} memberitakan hal yang sama.`,
      href: item.href,
    }));
  const facts = pickSources(input.live).map((item) => factBullet(item, contentPublishedAt, now));
  const seen = new Set(
    [...lead, ...facts].map((item) => item.href).filter((href): href is string => Boolean(href)),
  );
  const staleOutlets: EvidenceBullet[] = corroboration
    .filter((item) => item.primary === false)
    .filter((item) => !item.href || !seen.has(item.href))
    .map((item) => {
      const when = whenLabel(item.publishedAt, contentPublishedAt, now);
      const head = when ? `${item.name}, ${when}` : item.name;
      return { text: `Artikel lama. ${head}.`, href: item.href };
    });
  const oldCorpus = (input.corpus ?? [])
    .filter((item) => stale(item, contentPublishedAt, now))
    .filter((item) => !item.url || !seen.has(item.url))
    .slice(0, 2)
    .map((item) => corpusBullet(item, contentPublishedAt, now));
  const combined = [...lead, ...facts];
  if (lead.length === 0 && staleOutlets.length === 0) combined.push({ text: NONE, href: null });
  combined.push(...staleOutlets, ...oldCorpus);
  return combined.slice(0, 3);
}
