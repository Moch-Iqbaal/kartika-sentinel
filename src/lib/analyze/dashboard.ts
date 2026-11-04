import { actionBadge, type ActionBadge } from "./action-badge";
import { buildRingkasan, type RingkasanInput, type SummaryVerdict, VERDICT_LINE } from "./ringkasan";
import { SHORT_WORD_VERDICT } from "../ingest/short-text";
import { evidenceStance, independentReports } from "./evidence-stance";
import type { RiskBand } from "../scoring/risk";
import type { ExternalFact } from "../factcheck/types";
import type { HoaxAssessment } from "../model/classify";

/**
 * Angka dan label dasbor dari vonis akhir, bukan skor model mentah.
 * HOAKS = risiko tinggi. FAKTA = risiko rendah. Belum dinilai tetap teks biasa.
 */

export type DashboardPresentation = {
  riskScore: number;
  band: RiskBand;
  verdict: SummaryVerdict;
  verdictLabel: string;
  badge: ActionBadge;
  confidence: "Tinggi" | "Sedang" | "Rendah" | null;
};

function finite(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

export function displayRiskFromVerdict(
  verdict: SummaryVerdict,
  confidence: "Tinggi" | "Sedang" | "Rendah" | null,
): { riskScore: number; band: RiskBand } {
  if (verdict === "unscored") return { riskScore: 0, band: "pantau" };
  if (verdict === "hoax") {
    if (confidence === "Tinggi") return { riskScore: 0.92, band: "kritis" };
    if (confidence === "Sedang") return { riskScore: 0.8, band: "prioritas" };
    return { riskScore: 0.72, band: "prioritas" };
  }
  if (confidence === "Tinggi") return { riskScore: 0.12, band: "pantau" };
  if (confidence === "Sedang") return { riskScore: 0.28, band: "pantau" };
  return { riskScore: 0.38, band: "pantau" };
}

export function presentDashboardFromAssessment(input: {
  text: string;
  sourceUrl?: string | null;
  assessment: HoaxAssessment;
  external?: ExternalFact[];
  matches?: { verdict: string; similarity: number; publishedAt?: string | null }[];
  sensitivity?: number;
  virality?: number;
  now?: Date;
}): DashboardPresentation {
  const raw = input.assessment ?? ({} as HoaxAssessment);
  const assessment: HoaxAssessment = {
    probability: Number.isFinite(raw.probability) ? raw.probability : 0,
    engine: raw.engine ?? "heuristic",
    modelVersion: raw.modelVersion ?? "unknown",
    indobert: raw.indobert ?? null,
    linear: raw.linear ?? null,
    heuristic: raw.heuristic ?? { probability: 0, reasons: [] },
    ai: raw.ai ?? { flagged: false, score: 0, confidence: "rendah", reasons: [], signals: [], disclaimer: "" },
    modelStatus: raw.modelStatus ?? "dilewati",
    caution: raw.caution ?? null,
    unscored: raw.unscored ?? null,
    opinion: raw.opinion ?? null,
    youtube: raw.youtube ?? null,
    factCheck: raw.factCheck ?? null,
    contentPublishedAt: raw.contentPublishedAt ?? null,
  };
  const external = input.external ?? [];
  const matches = input.matches ?? [];
  const now = input.now ?? new Date();
  const contentPublishedAt = assessment.contentPublishedAt ?? null;
  const outlets = independentReports(input.sourceUrl, input.text, external, { contentPublishedAt, now })
    .filter((item) => item.primary)
    .map((item) => item.name);
  const hoaxCheckers = external
    .filter((item) => evidenceStance(item.rating) === "hoax")
    .map((item) => item.publisher || item.source);
  const validCheckers = external
    .filter((item) => evidenceStance(item.rating) === "valid")
    .map((item) => item.publisher || item.source);

  const ringInput: RingkasanInput = {
    hoaxScore: assessment.probability,
    band: "pantau",
    sensitivity: input.sensitivity ?? 0,
    virality: input.virality ?? 0,
    engine: assessment.engine,
    indobert: finite(assessment.indobert?.probability),
    linear: finite(assessment.linear?.probability),
    heuristic: finite(assessment.heuristic?.probability),
    aiFlagged: assessment.ai.flagged,
    aiConfidence: assessment.ai.confidence,
    shortText: Boolean(assessment.caution?.warning),
    shortWords: assessment.caution?.warning === SHORT_WORD_VERDICT,
    opinion: Boolean(assessment.opinion?.note),
    textChars: assessment.caution?.bodyChars ?? input.text.trim().length,
    unscored: Boolean(assessment.unscored?.reason),
    unscoredReason: assessment.unscored?.reason ?? "",
    topicLabels: [],
    matches,
    externalCount: external.length,
    externalRatings: external.map((item) => item.rating ?? ""),
    hoaxCheckers,
    validCheckers,
    otherOutlets: outlets,
    contentPublishedAt,
    now,
    text: input.text,
    sourceUrl: input.sourceUrl,
  };

  const ring = buildRingkasan(ringInput);
  const shown = displayRiskFromVerdict(ring.verdict, ring.confidence);
  return {
    riskScore: shown.riskScore,
    band: shown.band,
    verdict: ring.verdict,
    verdictLabel: VERDICT_LINE[ring.verdict],
    badge: actionBadge(ring.verdict, ring.confidence),
    confidence: ring.confidence,
  };
}
