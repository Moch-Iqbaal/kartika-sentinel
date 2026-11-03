/**
 * Melatih regresi logistik n-gram pada IDNHoaxCorpus.
 * Fitur sama dengan src/lib/model/features.ts. Metrik hold-out ditulis
 * apa adanya ke data/seed/linear-model.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FEATURE_DIM, scoreWeights, sparseFeatures, type SparseFeature } from "../src/lib/model/features";

type Example = { y: number; features: SparseFeature[] };

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const header = rows[0] ?? [];
  return rows.slice(1).filter((item) => item.some((value) => value.trim())).map((item) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = item[index] ?? "";
    });
    return record;
  });
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function metrics(examples: Example[], weights: number[], bias: number) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let correct = 0;
  for (const example of examples) {
    const predicted = scoreWeights(example.features, weights, bias) >= 0.5 ? 1 : 0;
    if (predicted === example.y) correct += 1;
    if (predicted === 1 && example.y === 1) tp += 1;
    if (predicted === 1 && example.y === 0) fp += 1;
    if (predicted === 0 && example.y === 1) fn += 1;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    n: examples.length,
    accuracy: examples.length === 0 ? 0 : correct / examples.length,
    hoaxF1: f1,
    hoaxPrecision: precision,
    hoaxRecall: recall,
  };
}

function main() {
  const csvPath = path.join(process.cwd(), "data", "cache", "idn-hoax.csv");
  const records = parseCsv(readFileSync(csvPath, "utf8"));
  const examples: Example[] = [];
  for (const record of records) {
    const label = (record.label || "").trim().toLowerCase();
    if (label !== "hoax" && label !== "valid") continue;
    const text = record.tweet || "";
    if (text.trim().length < 15) continue;
    examples.push({ y: label === "hoax" ? 1 : 0, features: sparseFeatures(text) });
  }
  const ordered = shuffle(examples, mulberry32(2026));
  const cut = Math.floor(ordered.length * 0.8);
  const train = ordered.slice(0, cut);
  const holdout = ordered.slice(cut);
  const hoaxCount = train.filter((item) => item.y === 1).length || 1;
  const validCount = train.filter((item) => item.y === 0).length || 1;
  const weightFor = (y: number) => (y === 1 ? train.length / (2 * hoaxCount) : train.length / (2 * validCount));

  const weights = new Array<number>(FEATURE_DIM).fill(0);
  let bias = 0;
  const epochs = 8;
  const learningRate = 0.35;
  const l2 = 1e-4;
  const rand = mulberry32(7);
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const batch = shuffle(train, rand);
    for (const example of batch) {
      let raw = bias;
      for (const feature of example.features) raw += weights[feature.index] * feature.value;
      const prediction = raw > 20 ? 1 : raw < -20 ? 0 : 1 / (1 + Math.exp(-raw));
      const error = (prediction - example.y) * weightFor(example.y);
      for (const feature of example.features) {
        weights[feature.index] -= learningRate * (error * feature.value + l2 * weights[feature.index]);
      }
      bias -= learningRate * error;
    }
  }

  const holdoutMetrics = metrics(holdout, weights, bias);
  const rounded = weights.map((value) => Number(value.toFixed(5)));
  const payload = {
    version: "linear-ngram-v1",
    featureDim: FEATURE_DIM,
    bias: Number(bias.toFixed(5)),
    weights: rounded,
    trainedOn: "9uz/IDNHoaxCorpus label hoax dan valid",
    license: "MIT",
    holdout: {
      n: holdoutMetrics.n,
      accuracy: Number(holdoutMetrics.accuracy.toFixed(4)),
      hoaxF1: Number(holdoutMetrics.hoaxF1.toFixed(4)),
      hoaxPrecision: Number(holdoutMetrics.hoaxPrecision.toFixed(4)),
      hoaxRecall: Number(holdoutMetrics.hoaxRecall.toFixed(4)),
    },
    note: "Regresi logistik hashing n-gram, dilatih di mesin ini pada potongan 80 persen IDNHoaxCorpus. Bukan IndoBERT. Angka hold-out di berkas ini hasil hitung skrip, bukan klaim kartu model.",
  };
  writeFileSync(path.join(process.cwd(), "data", "seed", "linear-model.json"), JSON.stringify(payload));
  console.log(JSON.stringify({ train: train.length, holdout: holdoutMetrics }));
}

main();
