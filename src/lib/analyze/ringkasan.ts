import type { CaseDetail } from "../db/types";
import { decideConfidence, CONFIDENCE_LABEL } from "./confidence";
import { HOAX_CALL_MIN } from "./bands";
import { evidenceStance, independentReports } from "./evidence-stance";
import { percent } from "../format";
import { OPINION_SENTENCE } from "./opinion";
import { SHORT_WORD_VERDICT } from "../ingest/short-text";
import { ENGINE_DIVERGENCE } from "../model/divergence";
import type { RiskBand } from "../scoring/risk";

/**
 * Vonis hanya dua: HOAKS atau FAKTA.
 * Urutan: pemeriksaan fakta hoaks, lalu fakta/berita lain, lalu kritik kebijakan, lalu angka.
 * Angka memakai IndoBERT bila ada, kalau tidak angka yang tersimpan.
 * Keyakinan rendah menjelaskan teks pendek, dua penilaian yang tidak sejalan, atau bukti sedikit.
 * Kanal sendiri dan domain artikel sendiri bukan berita penguat.
 */

export type SummaryVerdict = "hoax" | "not-hoax" | "unscored";

export const VERDICT_LINE: Record<SummaryVerdict, string> = {
  hoax: "Kemungkinan HOAKS",
  "not-hoax": "Kemungkinan FAKTA",
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
  shortWords: boolean;
  opinion: boolean;
  textChars: number;
  unscored: boolean;
  unscoredReason: string;
  topicLabels: string[];
  matches: { verdict: string; similarity: number }[];
  externalCount: number;
  externalRatings?: string[];
  hoaxCheckers?: string[];
  validCheckers?: string[];
  /** Media lain, bukan asal teks. */
  otherOutlets?: string[];
};

export type Ringkasan = {
  verdict: SummaryVerdict;
  headline: string;
  sentences: string[];
  confidence: "Tinggi" | "Sedang" | "Rendah" | null;
  confidenceReason: string | null;
};

function finite(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

/** Ambang angka saja: 0,5 ke atas hoaks. Bukan vonis akhir. */
export function scoreVerdict(hoaxScore: number): "hoax" | "not-hoax" {
  if (!Number.isFinite(hoaxScore)) return "not-hoax";
  return hoaxScore >= HOAX_CALL_MIN ? "hoax" : "not-hoax";
}

function gap(left: number | null, right: number | null): number | null {
  if (left == null || right == null) return null;
  return Math.abs(left - right);
}

function enginesDisagree(input: RingkasanInput): boolean {
  const linearGap = gap(finite(input.indobert), finite(input.linear));
  if (linearGap != null && linearGap >= ENGINE_DIVERGENCE) return true;
  const heuristicGap = gap(finite(input.indobert), finite(input.heuristic));
  return heuristicGap != null && heuristicGap >= ENGINE_DIVERGENCE;
}

/**
 * Skor utama yang tersimpan. Itu sudah IndoBERT bila penilai itu yang dipakai,
 * dan sudah diturunkan bila teksnya pendek.
 */
export function verdictScore(input: RingkasanInput): number {
  return Number.isFinite(input.hoaxScore) ? input.hoaxScore : 0;
}

function names(values: string[] | undefined): string[] {
  return (values ?? []).map((name) => name.trim()).filter(Boolean);
}

function hasHoaxCheck(input: RingkasanInput): boolean {
  if (names(input.hoaxCheckers).length > 0) return true;
  return input.matches.some((match) => evidenceStance(match.verdict) === "hoax")
    || (input.externalRatings ?? []).some((rating) => evidenceStance(rating) === "hoax");
}

function hasValidCheck(input: RingkasanInput): boolean {
  if (names(input.validCheckers).length > 0) return true;
  return input.matches.some((match) => evidenceStance(match.verdict) === "valid")
    || (input.externalRatings ?? []).some((rating) => evidenceStance(rating) === "valid");
}

function otherOutlets(input: RingkasanInput): string[] {
  return names(input.otherOutlets);
}

export function decideVerdict(input: RingkasanInput): SummaryVerdict {
  if (input.unscored) return "unscored";
  if (hasHoaxCheck(input)) return "hoax";
  if (hasValidCheck(input) || otherOutlets(input).length > 0) return "not-hoax";
  if (input.opinion) return "not-hoax";
  return scoreVerdict(verdictScore(input));
}

function analystLine(): string {
  return "Keputusan akhir ada pada analis.";
}

function checkerLine(names: string[], kind: "hoax" | "valid"): string {
  if (names.length === 0) {
    return kind === "hoax"
      ? "Pemeriksaan fakta menyebut ini hoaks."
      : "Pemeriksaan fakta menyebut ini benar.";
  }
  return kind === "hoax"
    ? `${names[0]} menyebut ini hoaks.`
    : `${names[0]} menyebut ini benar.`;
}

export function buildRingkasan(input: RingkasanInput): Ringkasan {
  const verdict = decideVerdict(input);
  const thin = !hasHoaxCheck(input) && !hasValidCheck(input) && otherOutlets(input).length === 0;
  const confidence = input.unscored
    ? null
    : decideConfidence({
      textChars: input.textChars,
      shortText: input.shortText || input.shortWords,
      shortKind: input.shortWords ? "words" : input.shortText ? "chars" : null,
      indobert: input.indobert,
      linear: input.linear,
      matchCount: input.matches.length,
      externalCount: input.externalCount,
      thinEvidence: thin,
      disagree: enginesDisagree(input),
    });
  const confidenceLabel = (confidence ? CONFIDENCE_LABEL[confidence.level] : null) as Ringkasan["confidence"];
  const confidenceReason = confidence?.level === "rendah" ? confidence.because : null;

  if (verdict === "unscored") {
    return {
      verdict,
      headline: VERDICT_LINE.unscored,
      sentences: [
        input.unscoredReason || "Tidak ada teks yang bisa dinilai.",
        "Tempel keterangan gambar bila ingin dinilai.",
        analystLine(),
      ],
      confidence: null,
      confidenceReason: null,
    };
  }

  const score = percent(verdictScore(input));
  const outlets = otherOutlets(input);
  let lead: string;
  if (verdict === "hoax" && hasHoaxCheck(input)) lead = checkerLine(names(input.hoaxCheckers), "hoax");
  else if (verdict === "not-hoax" && hasValidCheck(input)) lead = checkerLine(names(input.validCheckers), "valid");
  else if (verdict === "not-hoax" && outlets.length > 0) lead = `${outlets[0]} memberitakan hal yang sama.`;
  else if (verdict === "not-hoax" && input.opinion) lead = OPINION_SENTENCE;
  else lead = `Angka kemiripan hoaks ${score}.`;

  const reason = confidenceReason ? `Keyakinan rendah: ${confidenceReason}.` : null;
  const sentences = [lead, reason, analystLine()].filter((sentence): sentence is string => Boolean(sentence));
  return {
    verdict,
    headline: VERDICT_LINE[verdict],
    sentences: sentences.slice(0, 3),
    confidence: confidenceLabel,
    confidenceReason,
  };
}

function factName(source: string, publisher: string | null | undefined): string {
  const pub = publisher?.trim();
  if (source === "Cek Fakta" && pub && !/cek fakta/i.test(pub)) return `Cek Fakta ${pub}`;
  return pub || source;
}

export function ringkasanFromCase(detail: CaseDetail): Ringkasan {
  const hoaxCheckers = detail.external
    .filter((item) => evidenceStance(item.rating) === "hoax")
    .map((item) => factName(item.source, item.publisher));
  const validCheckers = detail.external
    .filter((item) => evidenceStance(item.rating) === "valid")
    .map((item) => factName(item.source, item.publisher));
  for (const match of detail.matches) {
    const stance = evidenceStance(match.verdict);
    const name = factName(match.source, null);
    if (stance === "hoax" && !hoaxCheckers.includes(name)) hoaxCheckers.push(name);
    if (stance === "valid" && !validCheckers.includes(name)) validCheckers.push(name);
  }
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
    hoaxCheckers,
    validCheckers,
    otherOutlets: independentReports(detail.sourceUrl, detail.text, detail.external).map((item) => item.name),
  });
}
