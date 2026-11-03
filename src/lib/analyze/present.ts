import type { CaseDetail } from "@/lib/db/types";
import { independentReports } from "@/lib/analyze/evidence-stance";
import { ringkasanFromCase } from "@/lib/analyze/ringkasan";
import { buildEvidence, plainTopicLine, scoreLines, type EvidenceBullet, type ScoreLines } from "@/lib/analyze/report";
import { actionBadge, type ActionBadge } from "@/lib/analyze/action-badge";
import { checkedAtLabel } from "@/lib/factcheck/live-parse";
import {
  ENGAGEMENT_CEILING_SOURCE,
  parseEngagement,
  viralityFromEngagement,
} from "@/lib/scoring/engagement-parse";

export type PresentedReport = {
  headline: string;
  sentences: string[];
  confidence: string | null;
  confidenceReason: string | null;
  checkedLabel: string;
  bullets: EvidenceBullet[];
  scores: ScoreLines | null;
  topicLine: string;
  /** Label aksi pojok kanan, dari vonis + keyakinan. */
  badge: ActionBadge;
  /** Catatan sumber angka viralitas untuk Detail teknis. */
  viralitasNote: string | null;
};

export function presentCase(detail: CaseDetail, now = new Date()): PresentedReport {
  const ringkasan = ringkasanFromCase(detail, now);
  const unscored = Boolean(detail.assessment.unscored?.reason);
  const checkedAt = detail.assessment.factCheck?.checkedAt;
  const contentPublishedAt = detail.assessment.contentPublishedAt ?? null;
  const parsed = parseEngagement(detail.text);
  const fromText = viralityFromEngagement(parsed);
  // Pakai yang lebih tinggi: angka tersimpan (demo/metrics) atau yang terbaca dari teks.
  const virality = Math.max(detail.virality, fromText);
  const engagementLabel = parsed.found ? parsed.plainLabel : null;
  let viralitasNote: string | null = null;
  if (parsed.found) {
    viralitasNote = `Viralitas dihitung dari angka di teks (${parsed.plainLabel}). ${ENGAGEMENT_CEILING_SOURCE}`;
  } else if (detail.virality > 0) {
    viralitasNote = `Viralitas dari jejak sebaran tersimpan. ${ENGAGEMENT_CEILING_SOURCE}`;
  }
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
    scores: unscored ? null : scoreLines(detail.hoaxScore, detail.sensitivity, virality, engagementLabel),
    topicLine: plainTopicLine(detail.topics.map((topic) => topic.label)),
    badge: actionBadge(ringkasan.verdict, ringkasan.confidence),
    viralitasNote,
  };
}
