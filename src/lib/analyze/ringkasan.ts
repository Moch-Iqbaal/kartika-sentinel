import type { CaseDetail } from "../db/types";
import { decideConfidence } from "./confidence";
import { HOAX_CALL_MIN } from "./bands";
import { percent } from "../format";
import { OPINION_NOTE } from "./opinion";
import { SHORT_WORD_VERDICT } from "../ingest/short-text";
import { ENGINE_DIVERGENCE } from "../model/divergence";
import type { RiskBand } from "../scoring/risk";

/**
 * Ringkasan pendek untuk orang awam. Tidak memanggil model bahasa.
 * "Belum bisa dipastikan" hanya bila keyakinan Rendah, teks terlalu pendek,
 * atau dua mesin berselisih pada ambang yang sudah dipakai berkas.
 * Selain itu: HOAKS bila skor minimal 0,5, kalau tidak FAKTA.
 */

export type SummaryVerdict = "hoax" | "not-hoax" | "uncertain" | "unscored" | "short";

export const VERDICT_LINE: Record<SummaryVerdict, string> = {
  hoax: "Kemungkinan HOAKS",
  "not-hoax": "Kemungkinan FAKTA",
  uncertain: "Belum bisa dipastikan",
  unscored: "Belum bisa dinilai",
  short: SHORT_WORD_VERDICT,
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
  shortWords: boolean;
  opinion: boolean;
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

/** Skor saja, sebelum pagar teks pendek dan selisih mesin. */
export function scoreVerdict(hoaxScore: number): SummaryVerdict {
  if (!Number.isFinite(hoaxScore)) return "uncertain";
  return hoaxScore >= HOAX_CALL_MIN ? "hoax" : "not-hoax";
}

function gap(left: number | null, right: number | null): number | null {
  if (left == null || right == null) return null;
  return Math.abs(left - right);
}

function enginesDisagree(input: RingkasanInput): "linear" | "heuristic" | null {
  const linearGap = gap(finite(input.indobert), finite(input.linear));
  if (linearGap != null && linearGap >= ENGINE_DIVERGENCE) return "linear";
  const heuristicGap = gap(finite(input.indobert), finite(input.heuristic));
  if (heuristicGap != null && heuristicGap >= ENGINE_DIVERGENCE) return "heuristic";
  return null;
}

export function decideVerdict(input: RingkasanInput): SummaryVerdict {
  if (input.unscored) return "unscored";
  if (input.shortWords) return "short";
  const confidence = decideConfidence({
    textChars: input.textChars,
    shortText: input.shortText || input.shortWords,
    shortKind: input.shortWords ? "words" : input.shortText ? "chars" : null,
    indobert: input.indobert,
    linear: input.linear,
    matchCount: input.matches.length,
    externalCount: input.externalCount,
  });
  if (input.shortText || confidence.level === "rendah" || enginesDisagree(input)) return "uncertain";
  return scoreVerdict(input.hoaxScore);
}

function analystLine(): string {
  return "Ini rekomendasi sistem. Keputusan akhir ada pada analis.";
}

function opinionLine(): string {
  return `Ini terbaca sebagai kritik. ${OPINION_NOTE}.`;
}

function callLine(input: RingkasanInput, verdict: SummaryVerdict): string {
  const call = verdict === "hoax" ? "hoaks" : "fakta";
  const score = percent(Number.isFinite(input.hoaxScore) ? input.hoaxScore : 0);
  return `Mesin membaca ini sebagai ${call}. Peluang hoaks ${score}.`;
}

export function buildRingkasan(input: RingkasanInput): Ringkasan {
  const verdict = decideVerdict(input);
  if (verdict === "unscored") {
    return {
      verdict,
      headline: VERDICT_LINE.unscored,
      sentences: [
        input.unscoredReason || "Tidak ada teks yang bisa dinilai.",
        "Tempel keterangan gambar bila ingin dinilai.",
        analystLine(),
      ].slice(0, 3),
    };
  }
  if (verdict === "short") {
    return {
      verdict,
      headline: VERDICT_LINE.short,
      sentences: [
        "Teksnya kurang dari 20 kata, jadi belum bisa dinilai.",
        input.opinion ? opinionLine() : "Angka mesin tidak andal untuk teks sependek ini.",
        analystLine(),
      ],
    };
  }
  if (verdict === "uncertain") {
    const disagree = enginesDisagree(input);
    const why = input.shortText
      ? "Teks sumber terlalu pendek, jadi belum bisa dipastikan."
      : disagree === "heuristic"
        ? "IndoBERT dan heuristik tidak sejalan, jadi belum bisa dipastikan."
        : disagree === "linear"
          ? "IndoBERT dan model linier tidak sejalan, jadi belum bisa dipastikan."
          : "Keyakinan hasil rendah, jadi belum bisa dipastikan.";
    return {
      verdict,
      headline: VERDICT_LINE.uncertain,
      sentences: [
        why,
        input.opinion ? opinionLine() : "Jangan pakai angka ini sebagai putusan.",
        analystLine(),
      ],
    };
  }
  return {
    verdict,
    headline: VERDICT_LINE[verdict],
    sentences: [
      callLine(input, verdict),
      input.opinion
        ? opinionLine()
        : input.matches.length + input.externalCount > 0
          ? "Bandingkan dengan bukti cek fakta di atas."
          : "Belum ada padanan cek fakta yang ketemu.",
      analystLine(),
    ],
  };
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
    shortWords: detail.assessment.caution?.warning === SHORT_WORD_VERDICT,
    opinion: Boolean(detail.assessment.opinion?.note),
    textChars: detail.assessment.caution?.bodyChars ?? detail.text.trim().length,
    unscored: Boolean(detail.assessment.unscored?.reason),
    unscoredReason: detail.assessment.unscored?.reason ?? "",
    topicLabels: detail.topics.map((topic) => topic.label),
    matches: detail.matches.map((match) => ({ verdict: match.verdict, similarity: match.similarity })),
    externalCount: detail.external.length,
  });
}
