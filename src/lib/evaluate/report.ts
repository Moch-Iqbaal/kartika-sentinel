import { readFileSync } from "node:fs";
import path from "node:path";

export type Confusion = {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
};

export type ClassMetrics = {
  n: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
};

export type FalsePositiveExample = {
  excerpt: string;
  probability: number;
  label: "valid";
};

export type EngineReport = {
  ran: boolean;
  note: string;
  threshold?: number;
  positiveClass?: string;
  n?: number;
  confusion?: Confusion;
  falsePositives?: FalsePositiveExample[];
};

export type EvaluationReport = {
  generatedAt: string;
  dataset: {
    name: string;
    url: string;
    file: string;
    sha256: string;
    license: string;
    copyright: string;
    collectedYear: string;
    collectedBy: string;
    rowsInFile: number;
    labeledUsed: number;
    excludedUnlabeledOrShort: number;
  };
  split: {
    seed: number;
    trainFraction: number;
    trainN: number;
    holdoutN: number;
    evaluatedN: number;
    droppedTrainText: number;
    indexOverlap: number;
  };
  linear: EngineReport;
  indobert: EngineReport;
};

export function metricsFromCounts(confusion: Confusion): ClassMetrics {
  const { tp, fp, fn, tn } = confusion;
  const n = tp + fp + fn + tn;
  const accuracy = n === 0 ? 0 : (tp + tn) / n;
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { n, accuracy, precision, recall, f1 };
}

export function reportPath(): string {
  return path.join(process.cwd(), "data", "seed", "evaluation.json");
}

export function loadEvaluation(): EvaluationReport {
  const report = JSON.parse(readFileSync(reportPath(), "utf8")) as EvaluationReport;
  assertConsistent(report);
  return report;
}

export function assertConsistent(report: EvaluationReport): void {
  if (report.split.indexOverlap !== 0) {
    throw new Error("Laporan evaluasi masih punya baris yang sama di latih dan uji.");
  }
  if (report.split.evaluatedN !== report.split.holdoutN - report.split.droppedTrainText) {
    throw new Error("Jumlah uji tidak cocok dengan hold-out setelah teks latih dibuang.");
  }
  const linear = report.linear;
  if (!linear.ran || !linear.confusion) {
    throw new Error("Laporan linier kosong. Jalankan npm run eval.");
  }
  const metrics = metricsFromCounts(linear.confusion);
  if (metrics.n !== linear.n || metrics.n !== report.split.evaluatedN) {
    throw new Error("Jumlah contoh linier tidak sama dengan matriks.");
  }
  if (linear.falsePositives && linear.falsePositives.length > linear.confusion.fp) {
    throw new Error("Contoh positif palsu lebih banyak daripada sel matriks.");
  }
  for (const example of linear.falsePositives ?? []) {
    if (example.label !== "valid") throw new Error("Contoh positif palsu harus berlabel valid.");
    if (!(example.probability >= 0.5)) throw new Error("Contoh positif palsu berada di bawah ambang.");
  }
  if (report.indobert.ran && !report.indobert.confusion) {
    throw new Error("IndoBERT ditandai jalan tetapi tidak punya matriks.");
  }
}
