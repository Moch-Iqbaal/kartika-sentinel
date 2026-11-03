import type { CaseDetail } from "@/lib/db/types";
import { independentReports } from "@/lib/analyze/evidence-stance";
import { ringkasanFromCase } from "@/lib/analyze/ringkasan";
import { buildEvidence, plainTopicLine, scoreLines, type EvidenceBullet, type ScoreLines } from "@/lib/analyze/report";
import { checkedAtLabel } from "@/lib/factcheck/live-parse";

export type PresentedReport = {
  headline: string;
  sentences: string[];
  confidence: string | null;
  confidenceReason: string | null;
  checkedLabel: string;
  bullets: EvidenceBullet[];
  scores: ScoreLines | null;
  topicLine: string;
};

export function presentCase(detail: CaseDetail, now = new Date()): PresentedReport {
  const ringkasan = ringkasanFromCase(detail, now);
  const unscored = Boolean(detail.assessment.unscored?.reason);
  const checkedAt = detail.assessment.factCheck?.checkedAt;
  const contentPublishedAt = detail.assessment.contentPublishedAt ?? null;
  return {
    headline: ringkasan.headline,
    sentences: ringkasan.sentences,
    confidence: ringkasan.confidence,
    confidenceReason: ringkasan.confidenceReason,
    checkedLabel: checkedAt ? checkedAtLabel(checkedAt) : "Waktu cek langsung tidak tersimpan.",
    bullets: buildEvidence({
      unscored,
      hoaxScore: detail.hoaxScore,
      engine: detail.engine,
      live: detail.external,
      corroboration: independentReports(detail.sourceUrl, detail.text, detail.external, { contentPublishedAt, now }),
      corpus: detail.matches,
      contentPublishedAt,
      now,
    }),
    scores: unscored ? null : scoreLines(detail.hoaxScore, detail.sensitivity, detail.virality),
    topicLine: plainTopicLine(detail.topics.map((topic) => topic.label)),
  };
}
