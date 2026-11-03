import { percent } from "../format";
import { BAND_KRITIS_MIN, BAND_PRIORITAS_MIN } from "../scoring/risk";

/**
 * Batas yang sama dengan pita risiko.
 * Rendah di bawah 0,40. Sedang dari 0,40 sampai di bawah 0,66. Tinggi dari 0,66.
 * Dipakai skor utama, sensitivitas, dan viralitas supaya kata dan angka tidak bentrok.
 */
export type PlainBand = "rendah" | "sedang" | "tinggi";

/**
 * Ambang tiap angka: 0,5 ke atas lebih mirip hoaks daripada fakta.
 * Bukan vonis sendirian. Menaikkan ambang satu angka (misalnya ke 0,7) tidak
 * menahan skor 99% yang tidak disetujui angka lain.
 */
export const HOAX_CALL_MIN = 0.5;

export const SCORE_MEANING = "seberapa mirip hoaks";
export const SENSITIVITY_MEANING = "seberapa rawan topiknya";
export const VIRALITY_MEANING = "seberapa besar sebarannya";

export function plainBand(value: number): PlainBand {
  if (!Number.isFinite(value)) return "rendah";
  if (value >= BAND_KRITIS_MIN) return "tinggi";
  if (value >= BAND_PRIORITAS_MIN) return "sedang";
  return "rendah";
}

export function metricLine(name: string, value: number, meaning: string): string {
  return `${name} ${percent(value)} = ${meaning}`;
}
