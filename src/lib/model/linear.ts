import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { FEATURE_DIM, scoreWeights, sparseFeatures } from "@/lib/model/features";

export type LinearModel = {
  version: string;
  featureDim: number;
  bias: number;
  weights: number[];
  trainedOn: string;
  license: string;
  holdout: {
    n: number;
    accuracy: number;
    hoaxF1: number;
    hoaxPrecision: number;
    hoaxRecall: number;
  };
  note: string;
};

let cached: LinearModel | null | undefined;

export function loadLinearModel(): LinearModel | null {
  if (cached !== undefined) return cached;
  const file = path.join(process.cwd(), "data", "seed", "linear-model.json");
  if (!existsSync(file)) {
    cached = null;
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as LinearModel;
    if (parsed.featureDim !== FEATURE_DIM || parsed.weights.length !== FEATURE_DIM) {
      cached = null;
      return null;
    }
    cached = parsed;
    return parsed;
  } catch {
    cached = null;
    return null;
  }
}

export function linearHoaxProbability(text: string): { probability: number; version: string } | null {
  const model = loadLinearModel();
  if (!model) return null;
  const probability = scoreWeights(sparseFeatures(text), model.weights, model.bias);
  return { probability, version: model.version };
}
