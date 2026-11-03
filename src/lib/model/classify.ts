import { detectAiText, type AiTextFlag } from "@/lib/model/ai-text";
import { heuristicHoax, type HeuristicScore } from "@/lib/model/heuristic";
import { linearHoaxProbability } from "@/lib/model/linear";
import { classifyWithLocalIndoBert, type LocalModelScore } from "@/lib/model/local-indobert";

export type HoaxEngine = "indobert-local" | "linear-ngram" | "heuristic";

export type HoaxAssessment = {
  probability: number;
  engine: HoaxEngine;
  modelVersion: string;
  indobert: LocalModelScore | null;
  linear: { probability: number; version: string } | null;
  heuristic: HeuristicScore;
  ai: AiTextFlag;
};

/**
 * Urutan mesin, semuanya di infrastruktur sendiri:
 * 1. IndoBERT lokal jika prosesnya hidup
 * 2. model linier n-gram yang bobotnya ada di repo
 * 3. heuristik leksikal
 * Skor utama tidak dicampur. Heuristik selalu dihitung supaya analis melihat alasannya.
 */
export async function assessHoax(
  text: string,
  options?: { allowIndobert?: boolean },
): Promise<HoaxAssessment> {
  const heuristic = heuristicHoax(text);
  const linear = linearHoaxProbability(text);
  const indobert = options?.allowIndobert === false ? null : await classifyWithLocalIndoBert(text);
  const ai = detectAiText(text);

  if (indobert) {
    return {
      probability: indobert.probability,
      engine: "indobert-local",
      modelVersion: indobert.version,
      indobert,
      linear,
      heuristic,
      ai,
    };
  }
  if (linear) {
    return {
      probability: linear.probability,
      engine: "linear-ngram",
      modelVersion: linear.version,
      indobert: null,
      linear,
      heuristic,
      ai,
    };
  }
  return {
    probability: heuristic.probability,
    engine: "heuristic",
    modelVersion: "heuristic-v1",
    indobert: null,
    linear: null,
    heuristic,
    ai,
  };
}
