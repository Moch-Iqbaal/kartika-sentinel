import type { CaseDetail } from "../db/types";
import { confidenceSentence, decideConfidence } from "./confidence";
import { engineLabel, percent, recommendation, verdictLabel } from "../format";
import { NO_STRONG_MATCH } from "../factcheck/threshold";
import { ENGINE_DIVERGENCE } from "../model/divergence";
import { BAND_KRITIS_MIN, BAND_PRIORITAS_MIN, type RiskBand } from "../scoring/risk";

/**
 * Ringkasan deterministik. Tidak memanggil model bahasa.
 * Ambang skor memakai pita yang sama dengan risiko:
 * tinggi = kritis (0,66), rendah = di bawah prioritas (0,40), sisanya belum pasti.
 * Selisih mesin memakai ENGINE_DIVERGENCE (0,35), ambang yang sudah dipakai berkas.
 */

export type SummaryVerdict = "hoax" | "not-hoax" | "uncertain" | "unscored";

export const VERDICT_LINE: Record<SummaryVerdict, string> = {
  hoax: "Kemungkinan HOAKS",
  "not-hoax": "Kemungkinan BUKAN hoaks",
  uncertain: "Belum bisa dipastikan",
  unscored: "Belum bisa dinilai",
};

export type RingkasanInput = {
  hoaxScore: number;
  band: RiskBand;
  sensitivity: number;
  virality: number;
  engine: string;
  indobert: number | null;
  linear: number | null;
  heuristic: number | null;
  aiFlagged: boolean;
  aiConfidence: string;
  shortText: boolean;
  textChars: number;
  unscored: boolean;
  unscoredReason: string;
  topicLabels: string[];
  matches: { verdict: string; similarity: number }[];
  externalCount: number;
};

export type Ringkasan = {
  verdict: SummaryVerdict;
  headline: string;
  sentences: string[];
};

function finite(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

/** Skor utama saja, sebelum peringatan teks pendek dan selisih mesin. */
export function scoreVerdict(hoaxScore: number): SummaryVerdict {
  if (!Number.isFinite(hoaxScore)) return "uncertain";
  if (hoaxScore >= BAND_KRITIS_MIN) return "hoax";
  if (hoaxScore < BAND_PRIORITAS_MIN) return "not-hoax";
  return "uncertain";
}

function gap(left: number | null, right: number | null): number | null {
  if (left == null || right == null) return null;
  return Math.abs(left - right);
}

function topMatch(matches: RingkasanInput["matches"]): { verdict: string; similarity: number } | null {
  const ranked = matches.filter((match) => Number.isFinite(match.similarity));
  if (ranked.length === 0) return null;
  return [...ranked].sort((left, right) => right.similarity - left.similarity)[0];
}

function contradicts(base: SummaryVerdict, verdict: string): boolean {
  if (base === "uncertain") return false;
  if (base === "hoax" && verdict === "true") return true;
  if (base === "not-hoax" && (verdict === "hoax" || verdict === "misleading")) return true;
  return false;
}

/**
 * Urutan: skor tidak valid, teks pendek, selisih mesin, padanan yang bertentangan, lalu ambang skor.
 */
export function decideVerdict(input: RingkasanInput): SummaryVerdict {
  if (input.unscored) return "unscored";
  const base = scoreVerdict(input.hoaxScore);
  if (base === "uncertain" && !Number.isFinite(input.hoaxScore)) return "uncertain";
  if (input.shortText) return "uncertain";
  const linearGap = gap(finite(input.indobert), finite(input.linear));
  const heuristicGap = gap(finite(input.indobert), finite(input.heuristic));
  if ((linearGap != null && linearGap >= ENGINE_DIVERGENCE) || (heuristicGap != null && heuristicGap >= ENGINE_DIVERGENCE)) {
    return "uncertain";
  }
  const best = topMatch(input.matches);
  if (best && contradicts(base, best.verdict)) return "uncertain";
  return base;
}

function engineSentence(input: RingkasanInput): string {
  const score = percent(Number.isFinite(input.hoaxScore) ? input.hoaxScore : 0);
  const engine = engineLabel(input.engine);
  const linearGap = gap(finite(input.indobert), finite(input.linear));
  const heuristicGap = gap(finite(input.indobert), finite(input.heuristic));
  let compare = "IndoBERT tidak dipakai pada skor ini";
  if (linearGap != null) {
    compare = linearGap >= ENGINE_DIVERGENCE ? "IndoBERT dan model linier tidak sejalan" : "IndoBERT dan model linier sejalan";
  } else if (heuristicGap != null) {
    compare = heuristicGap >= ENGINE_DIVERGENCE ? "IndoBERT dan heuristik tidak sejalan" : "IndoBERT dan heuristik sejalan";
  }
  if (input.shortText) {
    return `Skor utama ${score} dari ${engine}, tetapi teks sumber terlalu pendek jadi angka ini tidak andal.`;
  }
  return `Skor utama ${score} dari ${engine}, dan ${compare}.`;
}

function contextSentence(input: RingkasanInput): string {
  const best = topMatch(input.matches);
  const matchText = input.matches.length === 0
    ? NO_STRONG_MATCH
    : `Ada ${input.matches.length} padanan cek fakta, teratas berlabel ${verdictLabel(best?.verdict ?? "unverified")}`;
  const external = input.externalCount > 0 ? `, plus ${input.externalCount} dari Fact Check Tools` : "";
  const topic = input.topicLabels.length === 0
    ? "tidak ada topik ontologi yang kuat"
    : `topik ${input.topicLabels.join(", ")} ikut menaikkan peringkat`;
  const spread = input.virality > 0 ? "ada data sebaran" : "tidak ada data sebaran";
  const ai = input.aiFlagged || input.aiConfidence === "sedang" || input.aiConfidence === "tinggi"
    ? "ada isyarat media AI"
    : "isyarat media AI tidak menonjol";
  return `${matchText}${external}, ${topic}, ${spread}, dan ${ai}.`;
}

export function buildRingkasan(input: RingkasanInput): Ringkasan {
  const verdict = decideVerdict(input);
  if (verdict === "unscored") {
    return {
      verdict,
      headline: VERDICT_LINE.unscored,
      sentences: [
        input.unscoredReason || "Tidak ada teks isi yang bisa dinilai, jadi skor hoaks tidak dihitung.",
        "Metadata dan teks sistem tidak dipakai sebagai klaim.",
        "Tempel keterangan gambar bila ingin teks itu dinilai.",
        "Ini rekomendasi sistem, keputusan akhir ada pada analis.",
      ],
    };
  }
  const confidence = decideConfidence({
    textChars: input.textChars,
    shortText: input.shortText,
    indobert: input.indobert,
    linear: input.linear,
    matchCount: input.matches.length,
    externalCount: input.externalCount,
  });
  const sentences = [
    engineSentence(input),
    confidenceSentence(confidence),
    contextSentence(input),
    recommendation(input.band),
    "Ini rekomendasi sistem, keputusan akhir ada pada analis.",
  ];
  return { verdict, headline: VERDICT_LINE[verdict], sentences };
}

export function ringkasanFromCase(detail: CaseDetail): Ringkasan {
  return buildRingkasan({
    hoaxScore: detail.hoaxScore,
    band: detail.band,
    sensitivity: detail.sensitivity,
    virality: detail.virality,
    engine: detail.engine,
    indobert: finite(detail.assessment.indobert?.probability),
    linear: finite(detail.assessment.linear?.probability),
    heuristic: finite(detail.assessment.heuristic?.probability),
    aiFlagged: detail.ai.flagged,
    aiConfidence: detail.ai.confidence,
    shortText: Boolean(detail.assessment.caution?.warning),
    textChars: detail.assessment.caution?.bodyChars ?? detail.text.trim().length,
    unscored: Boolean(detail.assessment.unscored?.reason),
    unscoredReason: detail.assessment.unscored?.reason ?? "",
    topicLabels: detail.topics.map((topic) => topic.label),
    matches: detail.matches.map((match) => ({ verdict: match.verdict, similarity: match.similarity })),
    externalCount: detail.external.length,
  });
}
