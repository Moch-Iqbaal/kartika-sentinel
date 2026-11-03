import {
  metricLine,
  plainBand,
  SCORE_MEANING,
  SENSITIVITY_MEANING,
  VIRALITY_MEANING,
  type PlainBand,
} from "./bands";
import { engineLabel, percent } from "../format";
import { factDateLabel, sourceFamily } from "../factcheck/live-parse";
import { hasHttpUrl } from "../factcheck/order";
import type { ExternalFact } from "../factcheck/types";

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

const ONLY_ONE = "Hanya satu sumber cek fakta yang ketemu.";
const NONE = "Tidak ada padanan cek fakta yang ketemu saat dicek langsung.";

export function scoreLines(hoax: number, sensitivity: number, virality: number): ScoreLines {
  const viralMeaning = virality <= 0 ? "tidak ada data sebaran yang tercatat" : VIRALITY_MEANING;
  return {
    utama: metricLine("Skor utama", hoax, SCORE_MEANING),
    utamaBand: plainBand(hoax),
    sensitivitas: metricLine("Sensitivitas", sensitivity, SENSITIVITY_MEANING),
    sensitivitasBand: plainBand(sensitivity),
    viralitas: metricLine("Viralitas", virality, viralMeaning),
    viralitasBand: plainBand(virality),
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

function factBullet(item: ExternalFact): EvidenceBullet {
  const date = factDateLabel(item.publishedAt);
  const name = displaySource(item);
  const head = date ? `${name}, ${date}` : name;
  return {
    text: `${head}: ${item.title}`,
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
 * Paling banyak tiga butir: sinyal mesin, lalu paling banyak dua sumber cek fakta.
 * Korpus tersimpan tidak dipakai di sini. Sumber hidup datang dari pencarian saat analisis.
 */
export function buildEvidence(input: {
  unscored: boolean;
  hoaxScore: number;
  engine: string;
  live: ExternalFact[];
}): EvidenceBullet[] {
  if (input.unscored) {
    return [{ text: "Tidak ada teks yang dinilai, jadi tidak ada bukti skor.", href: null }];
  }
  const model: EvidenceBullet = {
    text: `Mesin ${engineLabel(input.engine)}: peluang hoaks ${percent(input.hoaxScore)}.`,
    href: null,
  };
  const sources = pickSources(input.live);
  if (sources.length === 0) return [model, { text: NONE, href: null }];
  const facts = sources.map(factBullet);
  if (sources.length === 1) return [model, facts[0], { text: ONLY_ONE, href: null }];
  return [model, facts[0], facts[1]];
}
