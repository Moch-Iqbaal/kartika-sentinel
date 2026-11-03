export type RiskBand = "kritis" | "prioritas" | "pantau";

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
export function computeRisk(hoax: number, sensitivity: number, virality: number): number {
  const effectiveVirality = 0.4 + 0.6 * clamp01(virality);
  return clamp01(clamp01(hoax) * clamp01(sensitivity) * effectiveVirality);
}

export function riskBand(score: number): RiskBand {
  if (score >= 0.66) return "kritis";
  if (score >= 0.4) return "prioritas";
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
  const engagement = last.shares + 0.25 * last.likes + 0.5 * last.comments;
  let velocity = 0;
  if (ordered.length >= 2) {
    const previous = ordered[ordered.length - 2];
    const hours = Math.max(
      0.25,
      (new Date(last.observedAt).getTime() - new Date(previous.observedAt).getTime()) / 3_600_000,
    );
    velocity = Math.max(0, (last.shares - previous.shares) / hours);
  }
  const engagementPart = Math.log1p(engagement) / Math.log1p(20_000);
  const velocityPart = Math.log1p(velocity) / Math.log1p(2_000);
  return clamp01(0.55 * engagementPart + 0.45 * velocityPart);
}
