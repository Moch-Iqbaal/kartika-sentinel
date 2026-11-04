import { MIN_RELIABLE_CHARS } from "../ingest/short-text";

/**
 * Keyakinan mengikuti bukti penguat, bukan jargon mesin.
 * Tinggi: 2+ media lain menguatkan, atau ada padanan pemeriksaan fakta.
 * Sedang: 1 media lain menguatkan.
 * Rendah: HOAKS hanya karena belum ada penguat, atau teks terlalu pendek.
 */

export type ResultConfidence = "tinggi" | "sedang" | "rendah";

export const CONFIDENCE_LABEL: Record<ResultConfidence, string> = {
  tinggi: "Tinggi",
  sedang: "Sedang",
  rendah: "Rendah",
};

export type ConfidenceInput = {
  textChars: number;
  shortText: boolean;
  /** "words" bila pemicunya kurang dari 20 kata. */
  shortKind?: "words" | "chars" | null;
  indobert: number | null;
  linear: number | null;
  matchCount: number;
  externalCount: number;
  /** Tidak ada pemeriksaan fakta dan tidak ada media lain. */
  thinEvidence?: boolean;
  /** Dua penilaian berselisih, termasuk bila cadangan bukan angka linier. */
  disagree?: boolean;
  /** Jumlah media lain yang menguatkan (bukan asal teks). */
  outletCount?: number;
  /** Ada padanan pemeriksaan fakta (hoaks atau benar). */
  factCheckMatch?: boolean;
  /** HOAKS hanya karena tidak ada penguat independen. */
  hoaxFromNoCorroboration?: boolean;
};

export type ConfidenceDecision = {
  level: ResultConfidence;
  because: string;
};

export function decideConfidence(input: ConfidenceInput): ConfidenceDecision {
  const chars = Number.isFinite(input.textChars) ? input.textChars : 0;
  const short = input.shortText || chars < MIN_RELIABLE_CHARS;
  const outlets = Math.max(0, input.outletCount ?? 0);
  const fact = Boolean(input.factCheckMatch);

  if (input.hoaxFromNoCorroboration) {
    return { level: "rendah", because: "belum ada media lain yang memberitakan" };
  }
  if (short) {
    return { level: "rendah", because: "teks yang dinilai masih pendek" };
  }
  if (fact || outlets >= 2) {
    return {
      level: "tinggi",
      because: fact
        ? "ada padanan pemeriksaan fakta"
        : "dua atau lebih media lain memberitakan hal yang sama",
    };
  }
  if (outlets === 1) {
    return { level: "sedang", because: "satu media lain memberitakan hal yang sama" };
  }
  if (input.thinEvidence) {
    return { level: "rendah", because: "bukti pendukung masih sedikit" };
  }
  if (input.disagree) {
    return { level: "rendah", because: "penilaian otomatis belum sepenuhnya sejalan dengan bukti" };
  }
  return { level: "sedang", because: "bukti penguat masih terbatas" };
}

export function confidenceSentence(decision: ConfidenceDecision): string {
  return `Keyakinan hasil ${CONFIDENCE_LABEL[decision.level]}: ${decision.because}.`;
}
