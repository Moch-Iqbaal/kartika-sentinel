export type RiskBand = "kritis" | "prioritas" | "pantau";

/** Risiko pada atau di atas angka ini masuk pita kritis. Di bawah prioritas tetap pantau. */
export const BAND_KRITIS_MIN = 0.66;
export const BAND_PRIORITAS_MIN = 0.4;

/**
 * viralitas efektif = lantai + rentang × viralitas.
 * Lantai membuat klaim baru tidak jatuh ke nol hanya karena sebarannya masih kecil.
 */
export const EFFECTIVE_VIRALITY_FLOOR = 0.4;
export const EFFECTIVE_VIRALITY_SPAN = 0.6;

/** Langit normalisasi umpan demo, bukan konstanta universal. */
export const VIRALITY_ENGAGEMENT_CEILING = 20_000;
export const VIRALITY_VELOCITY_CEILING = 2_000;
export const VIRALITY_ENGAGEMENT_WEIGHT = 0.55;
export const VIRALITY_VELOCITY_WEIGHT = 0.45;
/** Bobot suka dan komentar terhadap sebar pada titik pengamatan terakhir. */
export const VIRALITY_LIKE_WEIGHT = 0.25;
export const VIRALITY_COMMENT_WEIGHT = 0.5;
/** Jarak waktu minimum antar pengamatan, dalam jam, supaya kecepatan tidak meledak. */
export const VIRALITY_MIN_HOURS = 0.25;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Risiko peringatan dini.
 * viralitas efektif = 0,4 + 0,6 × viralitas, supaya klaim sensitif yang baru
 * muncul tidak jatuh ke nol hanya karena sebarannya masih kecil.
 * Rumus: hoaks × sensitivitas topik × viralitas efektif.
 */
export function effectiveVirality(virality: number): number {
  return EFFECTIVE_VIRALITY_FLOOR + EFFECTIVE_VIRALITY_SPAN * clamp01(virality);
}

export function computeRisk(hoax: number, sensitivity: number, virality: number): number {
  return clamp01(clamp01(hoax) * clamp01(sensitivity) * effectiveVirality(virality));
}

export function riskBand(score: number): RiskBand {
  if (score >= BAND_KRITIS_MIN) return "kritis";
  if (score >= BAND_PRIORITAS_MIN) return "prioritas";
  return "pantau";
}

export type MetricPoint = {
  observedAt: string;
  likes: number;
  shares: number;
  comments: number;
};

/**
 * Viralitas 0–1 untuk skala umpan demo (bukan konstanta universal).
 * Engagement memakai log terhadap langit 20 ribu, kecepatan sebar terhadap
 * langit 2 ribu share per jam. Keduanya hanya menormalkan angka demo.
 */
export function viralityFromMetrics(points: MetricPoint[]): number {
  if (points.length === 0) return 0;
  const ordered = [...points].sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  const last = ordered[ordered.length - 1];
  const engagement = last.shares + VIRALITY_LIKE_WEIGHT * last.likes + VIRALITY_COMMENT_WEIGHT * last.comments;
  let velocity = 0;
  if (ordered.length >= 2) {
    const previous = ordered[ordered.length - 2];
    const hours = Math.max(
      VIRALITY_MIN_HOURS,
      (new Date(last.observedAt).getTime() - new Date(previous.observedAt).getTime()) / 3_600_000,
    );
    velocity = Math.max(0, (last.shares - previous.shares) / hours);
  }
  const engagementPart = Math.log1p(engagement) / Math.log1p(VIRALITY_ENGAGEMENT_CEILING);
  const velocityPart = Math.log1p(velocity) / Math.log1p(VIRALITY_VELOCITY_CEILING);
  return clamp01(VIRALITY_ENGAGEMENT_WEIGHT * engagementPart + VIRALITY_VELOCITY_WEIGHT * velocityPart);
}
