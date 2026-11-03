/**
 * Evaluasi hold-out model linier pada 9uz/IDNHoaxCorpus.
 * Potongan sama dengan scripts/train-linear.ts (seed 2026, 80/20).
 * Baris uji yang teksnya juga ada di potongan latih dibuang.
 * IndoBERT hanya diisi bila LOCAL_HOAX_URL hidup. Angka tidak dikarang.
 *
 *   npm run eval
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { holdoutSplit, withoutTrainText, type LabeledRow } from "../src/lib/evaluate/split";
import type { Confusion, EvaluationReport, FalsePositiveExample } from "../src/lib/evaluate/report";
import { scoreWeights, sparseFeatures } from "../src/lib/model/features";
import { redactSensitive } from "../src/lib/security/redact";

const THRESHOLD = 0.5;
const SEED = 2026;
const CSV = path.join(process.cwd(), "data", "cache", "idn-hoax.csv");
const MODEL = path.join(process.cwd(), "data", "seed", "linear-model.json");
const OUT = path.join(process.cwd(), "data", "seed", "evaluation.json");

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

function counts(rows: LabeledRow[], probabilities: number[]): Confusion {
  const confusion: Confusion = { tp: 0, fp: 0, fn: 0, tn: 0 };
  rows.forEach((row, index) => {
    const predicted = probabilities[index] >= THRESHOLD ? 1 : 0;
    if (predicted === 1 && row.y === 1) confusion.tp += 1;
    else if (predicted === 1 && row.y === 0) confusion.fp += 1;
    else if (predicted === 0 && row.y === 1) confusion.fn += 1;
    else confusion.tn += 1;
  });
  return confusion;
}

function falsePositives(rows: LabeledRow[], probabilities: number[]): FalsePositiveExample[] {
  return rows
    .map((row, index) => ({ row, probability: probabilities[index] }))
    .filter((item) => item.row.y === 0 && item.probability >= THRESHOLD)
    .sort((left, right) => right.probability - left.probability)
    .slice(0, 5)
    .map((item) => ({
      excerpt: redactSensitive(item.row.text).replace(/\s+/g, " ").trim().slice(0, 180),
      probability: Number(item.probability.toFixed(6)),
      label: "valid" as const,
    }));
}

async function indobertReport(rows: LabeledRow[]): Promise<EvaluationReport["indobert"]> {
  const endpoint = process.env.LOCAL_HOAX_URL?.trim();
  if (!endpoint) {
    return {
      ran: false,
      note: "IndoBERT tidak dijalankan. LOCAL_HOAX_URL kosong pada mesin ini, dan bobot model tidak dimuat di CI. Angka di laporan ini hanya model linier. Isi LOCAL_HOAX_URL lalu jalankan npm run eval untuk menambah matriks IndoBERT pada hold-out yang sama.",
    };
  }
  const probabilities: number[] = [];
  try {
    for (const row of rows) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: row.text.slice(0, 4000) }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        return { ran: false, note: `IndoBERT menjawab HTTP ${response.status}. Tidak ada angka IndoBERT yang ditulis.` };
      }
      const payload = (await response.json()) as { available?: boolean; hoaxProbability?: number };
      if (!payload.available || typeof payload.hoaxProbability !== "number") {
        return { ran: false, note: "IndoBERT belum siap. Tidak ada angka IndoBERT yang ditulis." };
      }
      probabilities.push(Math.min(1, Math.max(0, payload.hoaxProbability)));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "gagal";
    return { ran: false, note: `IndoBERT tidak selesai (${message}). Tidak ada angka IndoBERT yang ditulis.` };
  }
  return {
    ran: true,
    note: "Diukur pada hold-out yang sama dengan model linier, ambang 0,5, kelas positif hoaks.",
    threshold: THRESHOLD,
    positiveClass: "hoax",
    n: rows.length,
    confusion: counts(rows, probabilities),
    falsePositives: falsePositives(rows, probabilities),
  };
}

async function main() {
  const csvBytes = readFileSync(CSV);
  const records = parseCsv(csvBytes.toString("utf8"));
  const labeled: LabeledRow[] = [];
  records.forEach((record, index) => {
    const label = (record.label || "").trim().toLowerCase();
    const text = record.tweet || "";
    if ((label !== "hoax" && label !== "valid") || text.trim().length < 15) return;
    labeled.push({ index, text, y: label === "hoax" ? 1 : 0 });
  });
  const { train, holdout } = holdoutSplit(labeled, SEED, 0.8);
  const trainIndex = new Set(train.map((row) => row.index));
  const indexOverlap = holdout.filter((row) => trainIndex.has(row.index)).length;
  if (indexOverlap !== 0) throw new Error("Indeks latih dan uji bertumpuk.");
  const evaluated = withoutTrainText(train, holdout);
  const model = JSON.parse(readFileSync(MODEL, "utf8")) as { version: string; weights: number[]; bias: number };
  const probabilities = evaluated.kept.map((row) => scoreWeights(sparseFeatures(row.text), model.weights, model.bias));
  const confusion = counts(evaluated.kept, probabilities);
  const report: EvaluationReport = {
    generatedAt: new Date().toISOString(),
    dataset: {
      name: "9uz/IDNHoaxCorpus",
      url: "https://github.com/9uz/IDNHoaxCorpus",
      file: "dataset/datasetUMPOHoax.csv",
      sha256: createHash("sha256").update(csvBytes).digest("hex"),
      license: "MIT",
      copyright: "Copyright (c) 2024 Gus nanang syaifuddiin",
      collectedYear: "2020",
      collectedBy: "Universitas Muhammadiyah Ponorogo",
      rowsInFile: records.length,
      labeledUsed: labeled.length,
      excludedUnlabeledOrShort: records.length - labeled.length,
    },
    split: {
      seed: SEED,
      trainFraction: 0.8,
      trainN: train.length,
      holdoutN: holdout.length,
      evaluatedN: evaluated.kept.length,
      droppedTrainText: evaluated.dropped,
      indexOverlap,
    },
    linear: {
      ran: true,
      note: `Model ${model.version} yang sudah ada di repo, tidak dilatih ulang. Ambang ${THRESHOLD}. Kelas positif adalah hoaks. Hold-out seed ${SEED} setelah teks yang juga ada di potongan latih dibuang.`,
      threshold: THRESHOLD,
      positiveClass: "hoax",
      n: evaluated.kept.length,
      confusion,
      falsePositives: falsePositives(evaluated.kept, probabilities),
    },
    indobert: await indobertReport(evaluated.kept),
  };
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    evaluatedN: report.split.evaluatedN,
    droppedTrainText: report.split.droppedTrainText,
    confusion,
    indobertRan: report.indobert.ran,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
