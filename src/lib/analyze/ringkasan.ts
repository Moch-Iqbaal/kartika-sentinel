import type { CaseDetail } from "../db/types";
import { decideConfidence } from "./confidence";
import { HOAX_ALONE_MIN, HOAX_CALL_MIN } from "./bands";
import { credibleLabel, evidenceStance } from "./evidence-stance";
import { percent } from "../format";
import { OPINION_SENTENCE } from "./opinion";
import { SHORT_WORD_VERDICT } from "../ingest/short-text";
import { ENGINE_DIVERGENCE } from "../model/divergence";
import type { RiskBand } from "../scoring/risk";

/**
 * Ringkasan pendek untuk orang awam. Tidak memanggil model bahasa.
 * "Belum bisa dipastikan" hanya bila keyakinan Rendah, teks terlalu pendek,
 * atau dua mesin berselisih pada ambang yang sudah dipakai berkas.
 * Skor 50–70% tanpa bukti hoaks tidak menjadi HOAKS.
 * Bukti yang menandai bukan hoaks, atau teks dari media/rilis resmi, menahan vonis HOAKS.
 * Sensitivitas dan viralitas tidak masuk ke vonis.
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
  /** Label pada cek fakta langsung, misalnya Salah atau Benar. */
  externalRatings?: string[];
  /** Nama pemeriksaan fakta yang benar-benar menyebut hoaks. Kosong bila hanya angka sistem. */
  hoaxCheckers?: string[];
  /** Teks dari media atau situs resmi yang memberitakan hal yang sama. */
  credibleSource?: boolean;
  /** Nama yang tampil, misalnya Kompas TV. */
  credibleName?: string | null;
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

function stances(input: RingkasanInput): { hoax: boolean; valid: boolean } {
  const labels = [
    ...input.matches.map((match) => match.verdict),
    ...(input.externalRatings ?? []),
  ];
  return {
    hoax: labels.some((label) => evidenceStance(label) === "hoax"),
    valid: labels.some((label) => evidenceStance(label) === "valid"),
  };
}

/**
 * Vonis dari skor hoaks saja, lalu bukti.
 * Sensitivitas dan viralitas tidak dibaca di sini.
 */
export function decideVerdict(input: RingkasanInput): SummaryVerdict {
  if (input.unscored) return "unscored";
  if (input.shortWords) return "short";
  if (input.shortText) return "uncertain";
  if (!Number.isFinite(input.hoaxScore)) return "uncertain";
  const evidence = stances(input);
  const credible = Boolean(input.credibleSource);
  const confidence = decideConfidence({
    textChars: input.textChars,
    shortText: input.shortText || input.shortWords,
    shortKind: input.shortWords ? "words" : input.shortText ? "chars" : null,
    indobert: input.indobert,
    linear: input.linear,
    matchCount: input.matches.length,
    externalCount: input.externalCount,
  });
  if (evidence.hoax && (evidence.valid || credible)) return "uncertain";
  if ((evidence.valid || credible) && !evidence.hoax) return "not-hoax";
  if (confidence.level === "rendah" || enginesDisagree(input)) return "uncertain";
  if (evidence.hoax && input.hoaxScore >= HOAX_CALL_MIN) return "hoax";
  if (evidence.hoax) return "uncertain";
  if (input.hoaxScore >= HOAX_ALONE_MIN) return "hoax";
  return "uncertain";
}

function analystLine(): string {
  return "Ini rekomendasi sistem. Keputusan akhir ada pada analis.";
}

function opinionLine(): string {
  return OPINION_SENTENCE;
}

function outletName(input: RingkasanInput): string {
  return input.credibleName?.trim() || "berita itu";
}

function checkers(input: RingkasanInput): string[] {
  return (input.hoaxCheckers ?? []).map((name) => name.trim()).filter(Boolean);
}

function sourceLine(input: RingkasanInput): string {
  if (input.credibleName) return `${input.credibleName} memberitakan hal yang sama.`;
  if (stances(input).valid) return "Ada pemeriksaan fakta yang menyebut ini benar.";
  return "Ada sumber tepercaya yang memberitakan hal yang sama.";
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
        input.opinion ? opinionLine() : "Angka ini jangan dipakai untuk teks sependek itu.",
        analystLine(),
      ],
    };
  }
  if (verdict === "uncertain") {
    const disagree = enginesDisagree(input);
    const evidence = stances(input);
    const score = percent(Number.isFinite(input.hoaxScore) ? input.hoaxScore : 0);
    const named = checkers(input);
    const outlet = outletName(input);
    const why = input.shortText
      ? "Teksnya terlalu pendek, jadi belum bisa dipastikan."
      : input.credibleSource && named.length > 0
        ? `${named[0]} menyebut ini hoaks, tapi ${outlet} memberitakan hal yang sama, jadi belum bisa dipastikan.`
        : input.credibleSource && input.hoaxScore >= HOAX_CALL_MIN
          ? `Mesin menilai mirip hoaks, tapi ${outlet} memberitakan hal yang sama, jadi belum bisa dipastikan.`
          : disagree
            ? "Dua penilaian tidak sejalan, jadi belum bisa dipastikan."
            : named.length > 0
              ? `${named[0]} menyebut ini hoaks, tetapi angkanya rendah, jadi belum bisa dipastikan.`
              : evidence.hoax
                ? "Pemeriksaan fakta menyebut ini hoaks, tetapi angkanya rendah, jadi belum bisa dipastikan."
                : input.hoaxScore >= HOAX_CALL_MIN && input.hoaxScore < HOAX_ALONE_MIN
                  ? `Angka kemiripan hoaks ${score} belum cukup, dan belum ada bukti hoaks.`
                  : "Belum ada sumber yang menguatkan atau menyanggah.";
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
      verdict === "not-hoax"
        ? sourceLine(input)
        : checkers(input).length > 0
          ? `${checkers(input)[0]} menyebut ini hoaks.`
          : stances(input).hoax
            ? "Pemeriksaan fakta menyebut ini hoaks."
            : "Angka kemiripan hoaks tinggi, dan belum ada sumber yang menyanggah.",
      input.opinion ? opinionLine() : null,
      analystLine(),
    ].filter((sentence): sentence is string => Boolean(sentence)),
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
    externalRatings: detail.external.map((item) => item.rating ?? ""),
    hoaxCheckers: detail.external
      .filter((item) => evidenceStance(item.rating) === "hoax")
      .map((item) => {
        const publisher = item.publisher?.trim();
        if (item.source === "Cek Fakta" && publisher && !/cek fakta/i.test(publisher)) return `Cek Fakta ${publisher}`;
        return publisher || item.source;
      })
      .filter((name, index, all) => Boolean(name) && all.indexOf(name) === index),
    credibleName: credibleLabel(detail.sourceUrl, detail.text),
    credibleSource: credibleLabel(detail.sourceUrl, detail.text) != null,
  });
}
