import { percent } from "../format";
import { BAND_KRITIS_MIN, BAND_PRIORITAS_MIN } from "../scoring/risk";

/**
 * Batas yang sama dengan pita risiko.
 * Rendah di bawah 0,40. Sedang dari 0,40 sampai di bawah 0,66. Tinggi dari 0,66.
 * Dipakai skor utama, sensitivitas, dan viralitas supaya kata dan angka tidak bentrok.
 */
export type PlainBand = "rendah" | "sedang" | "tinggi";

/** Ambang yang sama dengan uji mesin: skor 0,5 ke atas disebut hoaks. */
export const HOAX_CALL_MIN = 0.5;

export const SCORE_MEANING = "peluang ini hoaks menurut mesin";
export const SENSITIVITY_MEANING = "seberapa rawan topiknya";
export const VIRALITY_MEANING = "seberapa besar sebaran yang tercatat";

export function plainBand(value: number): PlainBand {
  if (!Number.isFinite(value)) return "rendah";
  if (value >= BAND_KRITIS_MIN) return "tinggi";
  if (value >= BAND_PRIORITAS_MIN) return "sedang";
  return "rendah";
}

export function metricLine(name: string, value: number, meaning: string): string {
  return `${name} ${percent(value)} = ${meaning}`;
}
