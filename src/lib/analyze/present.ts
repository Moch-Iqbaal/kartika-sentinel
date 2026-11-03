import type { CaseDetail } from "@/lib/db/types";
import { credibleLabel } from "@/lib/analyze/evidence-stance";
import { ringkasanFromCase } from "@/lib/analyze/ringkasan";
import { buildEvidence, plainTopicLine, scoreLines, type EvidenceBullet, type ScoreLines } from "@/lib/analyze/report";
import { checkedAtLabel } from "@/lib/factcheck/live-parse";
import { hasHttpUrl } from "@/lib/factcheck/order";

export type PresentedReport = {
  headline: string;
  sentences: string[];
  checkedLabel: string;
  bullets: EvidenceBullet[];
  scores: ScoreLines | null;
  topicLine: string;
};

export function presentCase(detail: CaseDetail): PresentedReport {
  const ringkasan = ringkasanFromCase(detail);
  const unscored = Boolean(detail.assessment.unscored?.reason);
  const checkedAt = detail.assessment.factCheck?.checkedAt;
  const outlet = credibleLabel(detail.sourceUrl, detail.text);
  return {
    headline: ringkasan.headline,
    sentences: ringkasan.sentences,
    checkedLabel: checkedAt ? checkedAtLabel(checkedAt) : "Waktu cek langsung tidak tersimpan.",
    bullets: buildEvidence({
      unscored,
      hoaxScore: detail.hoaxScore,
      engine: detail.engine,
      live: detail.external,
      corroboration: outlet
        ? { name: outlet, href: detail.sourceUrl && hasHttpUrl(detail.sourceUrl) ? detail.sourceUrl : null }
        : null,
    }),
    scores: unscored ? null : scoreLines(detail.hoaxScore, detail.sensitivity, detail.virality),
    topicLine: plainTopicLine(detail.topics.map((topic) => topic.label)),
  };
}
