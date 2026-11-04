import type { CaseDetail } from "../db/types";
import { decideConfidence, CONFIDENCE_LABEL } from "./confidence";
import { HOAX_ALONE_MIN, HOAX_CALL_MIN } from "./bands";
import { evidenceStance, independentReports } from "./evidence-stance";
import { percent } from "../format";
import { countsAsPrimary, NEAR_SAME_SIMILARITY } from "../factcheck/recency";
import { publicSourceName } from "../factcheck/public-name";
import { plainNewsReport } from "./news-prior";
import { OPINION_SENTENCE } from "./opinion";
import { SHORT_WORD_VERDICT } from "../ingest/short-text";
import { ENGINE_DIVERGENCE } from "../model/divergence";
import type { RiskBand } from "../scoring/risk";

/**
 * Vonis hanya dua: HOAKS atau FAKTA.
 * FAKTA hanya bila ada media/sumber resmi lain (bukan asal teks) yang memberitakan sama,
 * dan tidak ada pemeriksaan fakta yang menyebut hoaks.
 * HOAKS bila pemeriksaan fakta menyebut hoaks, atau tidak ada penguat independen,
 * atau kedua penilai >= 0,7 dan sejalan (tanpa penguat).
 * IndoBERT tidak boleh menjatuhkan HOAKS sendirian bila sudah ada penguat.
 * Kanal/domain sendiri bukan berita penguat.
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
  matches: { verdict: string; similarity: number; publishedAt?: string | null }[];
  externalCount: number;
  externalRatings?: string[];
  hoaxCheckers?: string[];
  validCheckers?: string[];
  /** Media lain, bukan asal teks. */
  otherOutlets?: string[];
  /** Tanggal terbit isi yang dinilai, bila ada. */
  contentPublishedAt?: string | null;
  /** Untuk uji. Kosong berarti hari ini. */
  now?: Date;
  /** Teks yang dinilai, untuk prior kanal berita. */
  text?: string;
  sourceUrl?: string | null;
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

function clock(input: RingkasanInput): Date {
  return input.now ?? new Date();
}

function evidenceIsPrimary(
  item: { similarity?: number | null; publishedAt?: string | null },
  input: RingkasanInput,
): boolean {
  return countsAsPrimary(item.similarity ?? 0, item.publishedAt, input.contentPublishedAt, clock(input));
}

/**
 * Tanpa tanggal, hanya kemiripan hampir sama yang dihitung.
 * Kemiripan sedang pada judul yang tidak terkait tidak membalik vonis.
 */
function matchCanFlip(
  match: { similarity: number; publishedAt?: string | null },
  input: RingkasanInput,
): boolean {
  if (!evidenceIsPrimary(match, input)) return false;
  if (match.similarity >= NEAR_SAME_SIMILARITY) return true;
  return Boolean(match.publishedAt);
}

function hasHoaxCheck(input: RingkasanInput): boolean {
  if (names(input.hoaxCheckers).length > 0) return true;
  return input.matches.some((match) => evidenceStance(match.verdict) === "hoax" && matchCanFlip(match, input))
    || (input.externalRatings ?? []).some((rating) => evidenceStance(rating) === "hoax");
}

function hasValidCheck(input: RingkasanInput): boolean {
  if (names(input.validCheckers).length > 0) return true;
  return input.matches.some((match) => evidenceStance(match.verdict) === "valid" && matchCanFlip(match, input))
    || (input.externalRatings ?? []).some((rating) => evidenceStance(rating) === "valid");
}

function otherOutlets(input: RingkasanInput): string[] {
  return names(input.otherOutlets);
}

function backupScore(input: RingkasanInput): number | null {
  return finite(input.linear) ?? finite(input.heuristic);
}

/** Kedua angka ada, tidak berselisih jauh, dan masing-masing mencapai 0,7. */
function agreedHoaxCall(input: RingkasanInput): boolean {
  const primary = finite(input.indobert);
  const backup = backupScore(input);
  if (primary == null || backup == null) return false;
  if (Math.abs(primary - backup) >= ENGINE_DIVERGENCE) return false;
  return primary >= HOAX_ALONE_MIN && backup >= HOAX_ALONE_MIN;
}

const RUMOR_CUES = /\b(dikabarkan|kabarnya|beredar|inisial|belum\s+membantah|belum\s+membenarkan|katanya|viral|diteruskan|wa\s*grup|grup\s*wa|forward)\b/i;

export function hasRumorLanguage(text: string | undefined): boolean {
  if (!text) return false;
  return RUMOR_CUES.test(text);
}

/** Ada penguat independen: media lain atau pemeriksaan yang menyebut benar. */
export function hasIndependentCorroboration(input: RingkasanInput): boolean {
  return hasValidCheck(input) || otherOutlets(input).length > 0;
}

/**
 * FAKTA hanya dengan penguat. Tanpa penguat = HOAKS.
 * IndoBERT tidak menjatuhkan HOAKS sendirian bila penguat sudah ada (cabang di atas).
 */
export function decideVerdict(input: RingkasanInput): SummaryVerdict {
  if (input.unscored) return "unscored";
  if (hasHoaxCheck(input)) return "hoax";
  if (hasIndependentCorroboration(input)) return "not-hoax";
  return "hoax";
}

/** Judul atau kalimat pembuka dari teks yang dinilai. Tidak mengarang. */
export function contentLead(text: string | undefined): string | null {
  if (!text) return null;
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 12)
    .filter((line) => !/^kanal\s*:/i.test(line))
    .filter((line) => !/^https?:\/\//i.test(line));
  const first = lines[0] ?? "";
  if (!first) return null;
  // Potong di akhir kalimat bila ada, atau batas 160 karakter.
  const sentence = first.match(/^(.{12,160}?[.!?])(?:\s|$)/);
  let lead = (sentence?.[1] ?? first).trim();
  if (lead.length > 160) lead = `${lead.slice(0, 157).trim()}...`;
  lead = lead.replace(/\s+/g, " ");
  return lead.replace(/[.!?]+$/, "");
}

function contentSentence(input: RingkasanInput): string {
  const lead = contentLead(input.text);
  if (!lead) return "Isi yang dinilai tidak punya kalimat pembuka yang jelas.";
  return `Berita ini menyebut ${lead}.`;
}

function joinOutlets(values: string[]): string {
  const shown = values.map((name) => name.trim()).filter(Boolean);
  if (shown.length === 0) return "";
  if (shown.length === 1) return shown[0];
  if (shown.length === 2) return `${shown[0]} dan ${shown[1]}`;
  return `${shown.slice(0, -1).join(", ")}, dan ${shown[shown.length - 1]}`;
}

function checkerNames(rawNames: string[]): string[] {
  return names(rawNames).map((name) => publicSourceName(name));
}

function verdictSentence(input: RingkasanInput, verdict: SummaryVerdict): string {
  const score = percent(verdictScore(input));
  const outlets = otherOutlets(input);
  const hoaxNames = checkerNames(names(input.hoaxCheckers));
  const validNames = checkerNames(names(input.validCheckers));
  if (verdict === "hoax" && hoaxNames.length > 0) {
    return `Kemungkinan HOAKS karena ${joinOutlets(hoaxNames)} menyebut klaim ini hoaks.`;
  }
  if (verdict === "hoax" && hasHoaxCheck(input)) {
    return "Kemungkinan HOAKS karena pemeriksaan fakta menyebut klaim ini hoaks.";
  }
  if (verdict === "hoax") {
    // Tanpa penguat independen — kalimat wajib dari pemilik.
    return "Belum ada media atau sumber resmi lain yang memberitakan hal ini, jadi isinya belum bisa dipercaya.";
  }
  if (verdict === "not-hoax" && validNames.length > 0) {
    return `Kemungkinan FAKTA karena ${joinOutlets(validNames)} menyebut klaim ini benar.`;
  }
  if (verdict === "not-hoax" && outlets.length > 0) {
    return `Kemungkinan FAKTA karena isi yang sama juga diberitakan ${joinOutlets(outlets.slice(0, 3))}.`;
  }
  if (verdict === "not-hoax" && input.opinion) {
    return `Kemungkinan FAKTA. ${OPINION_SENTENCE}`;
  }
  return `Kemungkinan FAKTA. Angka kemiripan hoaks ${score}.`;
}

function confidenceSentence(reason: string | null): string | null {
  if (!reason) return null;
  return `Keyakinan rendah karena ${reason}.`;
}

function nextStepSentence(input: RingkasanInput, verdict: SummaryVerdict): string {
  if (verdict === "unscored") {
    return "Langkah berikutnya: tempel keterangan atau teks isi bila ingin dinilai.";
  }
  if (verdict === "hoax" && hasHoaxCheck(input)) {
    return "Langkah berikutnya: cocokkan dengan situs cek fakta atau keterangan resmi sebelum menindaklanjuti.";
  }
  if (verdict === "hoax") {
    return "Langkah berikutnya: cari berita resmi atau media independen yang memberitakan klaim yang sama sebelum menindaklanjuti.";
  }
  if (otherOutlets(input).length > 0 || hasValidCheck(input)) {
    return "Langkah berikutnya: simpan tautan media yang sama sebagai bukti, lalu pantau bila muncul versi berbeda.";
  }
  return "Langkah berikutnya: cek satu sumber resmi lagi sebelum menutup berkas.";
}

export function buildRingkasan(input: RingkasanInput): Ringkasan {
  const verdict = decideVerdict(input);
  const outlets = otherOutlets(input);
  const corroborated = hasIndependentCorroboration(input);
  const thin = !hasHoaxCheck(input) && !corroborated;
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
      outletCount: outlets.length,
      factCheckMatch: hasHoaxCheck(input) || hasValidCheck(input),
      hoaxFromNoCorroboration: decideVerdict(input) === "hoax" && !hasHoaxCheck(input) && !corroborated,
    });
  const confidenceLabel = (confidence ? CONFIDENCE_LABEL[confidence.level] : null) as Ringkasan["confidence"];
  const confidenceReason = confidence?.level === "rendah" ? confidence.because : null;

  if (verdict === "unscored") {
    return {
      verdict,
      headline: VERDICT_LINE.unscored,
      sentences: [
        input.unscoredReason || "Tidak ada teks yang bisa dinilai.",
        nextStepSentence(input, verdict),
      ],
      confidence: null,
      confidenceReason: null,
    };
  }

  const sentences = [
    contentSentence(input),
    verdictSentence(input, verdict),
    confidenceSentence(confidenceReason),
    nextStepSentence(input, verdict),
  ].filter((sentence): sentence is string => Boolean(sentence));

  return {
    verdict,
    headline: VERDICT_LINE[verdict],
    sentences: sentences.slice(0, 5),
    confidence: confidenceLabel,
    confidenceReason,
  };
}

function factName(source: string, publisher: string | null | undefined): string {
  return publicSourceName(source, publisher);
}

export function ringkasanFromCase(detail: CaseDetail, now = new Date()): Ringkasan {
  const contentPublishedAt = detail.assessment.contentPublishedAt ?? null;
  const primary = (item: { similarity?: number | null; publishedAt?: string | null }) =>
    countsAsPrimary(item.similarity ?? 0, item.publishedAt, contentPublishedAt, now);
  const external = detail.external.filter(primary);
  const matches = detail.matches.filter(primary);
  const hoaxCheckers = external
    .filter((item) => evidenceStance(item.rating) === "hoax")
    .map((item) => factName(item.source, item.publisher));
  const validCheckers = external
    .filter((item) => evidenceStance(item.rating) === "valid")
    .map((item) => factName(item.source, item.publisher));
  for (const match of matches) {
    if (!match.publishedAt && match.similarity < NEAR_SAME_SIMILARITY) continue;
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
    matches: matches.map((match) => ({ verdict: match.verdict, similarity: match.similarity, publishedAt: match.publishedAt })),
    externalCount: external.length,
    externalRatings: external.map((item) => item.rating ?? ""),
    hoaxCheckers,
    validCheckers,
    otherOutlets: independentReports(detail.sourceUrl, detail.text, detail.external, { contentPublishedAt, now })
      .filter((item) => item.primary)
      .map((item) => item.name),
    contentPublishedAt,
    now,
    text: detail.text,
    sourceUrl: detail.sourceUrl,
  });
}
