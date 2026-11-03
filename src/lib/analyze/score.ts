import "server-only";
import { embedText } from "@/lib/embed/hashing";
import { matchFactChecks } from "@/lib/factcheck/match";
import type { FactCheck, FactMatch } from "@/lib/factcheck/types";
import { detectAiText } from "@/lib/model/ai-text";
import { heuristicHoax } from "@/lib/model/heuristic";
import { linearHoaxProbability } from "@/lib/model/linear";
import { assessHoax, type HoaxAssessment } from "@/lib/model/classify";
import { matchTopics, topicSensitivity, type TopicHit } from "@/lib/ontology/topics";
import { redactSensitive } from "@/lib/security/redact";
import { sanitizeUntrusted } from "@/lib/security/untrusted";
import { computeRisk, type RiskBand, riskBand } from "@/lib/scoring/risk";

export type ScoreCard = {
  clean: string;
  assessment: HoaxAssessment;
  topics: TopicHit[];
  sensitivity: number;
  virality: number;
  risk: number;
  band: RiskBand;
  matches: FactMatch[];
  embedding: number[];
};

/** Skor batch tanpa IndoBERT, supaya umpan demo tetap deterministik dan cepat. */
export function scoreContentSync(raw: string, virality: number, corpus: FactCheck[]): ScoreCard {
  const clean = redactSensitive(sanitizeUntrusted(raw));
  const heuristic = heuristicHoax(clean);
  const linear = linearHoaxProbability(clean);
  const assessment: HoaxAssessment = linear
    ? {
        probability: linear.probability,
        engine: "linear-ngram",
        modelVersion: linear.version,
        indobert: null,
        linear,
        heuristic,
        ai: detectAiText(clean),
      }
    : {
        probability: heuristic.probability,
        engine: "heuristic",
        modelVersion: "heuristic-v1",
        indobert: null,
        linear: null,
        heuristic,
        ai: detectAiText(clean),
      };
  return finish(clean, assessment, virality, corpus);
}

function finish(clean: string, assessment: HoaxAssessment, virality: number, corpus: FactCheck[]): ScoreCard {
  const topics = matchTopics(clean);
  const sensitivity = topicSensitivity(topics);
  const risk = computeRisk(assessment.probability, sensitivity, virality);
  const matches = matchFactChecks(clean, corpus, 5).filter((item) => item.similarity >= 0.18);
  return {
    clean,
    assessment,
    topics,
    sensitivity,
    virality,
    risk,
    band: riskBand(risk),
    matches,
    embedding: embedText(clean),
  };
}

export async function scoreContent(
  raw: string,
  virality: number,
  corpus: FactCheck[],
  allowIndobert: boolean,
): Promise<ScoreCard> {
  const clean = redactSensitive(sanitizeUntrusted(raw));
  const assessment = await assessHoax(clean, { allowIndobert });
  return finish(clean, assessment, virality, corpus);
}
