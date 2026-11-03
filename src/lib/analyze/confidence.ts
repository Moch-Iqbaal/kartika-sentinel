import { MIN_RELIABLE_CHARS } from "../ingest/short-text";
import { ENGINE_DIVERGENCE } from "../model/divergence";

/**
 * Keyakinan hasil, bukan keyakinan isyarat AI.
 * Tinggi hanya bila tiga syarat sekaligus terpenuhi:
 * teks cukup panjang, IndoBERT dan model linier selisihnya di bawah ambang
 * yang sudah dipakai berkas, dan ada padanan cek fakta.
 * Teks pendek atau selisih mesin pada ambang memaksa Rendah.
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
  indobert: number | null;
  linear: number | null;
  matchCount: number;
  externalCount: number;
};

export type ConfidenceDecision = {
  level: ResultConfidence;
  because: string;
};

function finite(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

export function decideConfidence(input: ConfidenceInput): ConfidenceDecision {
  const chars = Number.isFinite(input.textChars) ? input.textChars : 0;
  const short = input.shortText || chars < MIN_RELIABLE_CHARS;
  const left = finite(input.indobert);
  const right = finite(input.linear);
  const gap = left == null || right == null ? null : Math.abs(left - right);
  const evidence = input.matchCount + input.externalCount > 0;
  if (short) {
    return { level: "rendah", because: "teks yang dinilai lebih pendek dari 200 karakter" };
  }
  if (gap != null && gap >= ENGINE_DIVERGENCE) {
    return { level: "rendah", because: "IndoBERT dan model linier berselisih jauh" };
  }
  if (gap != null && evidence) {
    return {
      level: "tinggi",
      because: "IndoBERT dan model linier sejalan, teks cukup panjang, dan ada padanan cek fakta",
    };
  }
  if (gap != null) {
    return { level: "sedang", because: "mesin sejalan dan teks cukup panjang, tetapi tidak ada padanan cek fakta" };
  }
  if (evidence) {
    return {
      level: "sedang",
      because: "hanya satu mesin yang dipakai, jadi kesepakatan belum terukur, meski ada padanan cek fakta",
    };
  }
  return { level: "sedang", because: "hanya satu mesin yang dipakai dan tidak ada padanan cek fakta" };
}

export function confidenceSentence(decision: ConfidenceDecision): string {
  return `Keyakinan hasil ${CONFIDENCE_LABEL[decision.level]}: ${decision.because}.`;
}
