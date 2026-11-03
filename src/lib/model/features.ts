/**
 * Fitur n-gram untuk model linier lokal (cadangan IndoBERT).
 * Dimensi ini terpisah dari EMBED_DIM pencocokan cek fakta.
 * Algoritma yang sama dipakai skrip pelatihan dan inferensi.
 */

import { fnv1a } from "../embed/hashing";

export const FEATURE_DIM = 2048;

const STOP = new Set([
  "yang", "dan", "di", "ke", "dari", "ini", "itu", "untuk", "dengan", "pada",
  "ada", "juga", "akan", "atau", "sebagai", "tidak", "tak", "adalah", "dalam",
  "oleh", "atas", "sudah", "telah", "para", "bagi", "sebuah", "suatu",
]);

export type SparseFeature = { index: number; value: number };

export function linearTokens(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP.has(word));
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i += 1) {
    bigrams.push(`${words[i]}_${words[i + 1]}`);
  }
  return [...words, ...bigrams];
}

export function sparseFeatures(text: string): SparseFeature[] {
  const bins = new Map<number, number>();
  for (const token of linearTokens(text)) {
    const index = fnv1a(`f:${token}`) % FEATURE_DIM;
    const sign = (fnv1a(`g:${token}`) & 1) === 0 ? 1 : -1;
    bins.set(index, (bins.get(index) ?? 0) + sign);
  }
  let norm = 0;
  for (const value of bins.values()) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return [...bins.entries()].map(([index, value]) => ({ index, value: value / norm }));
}

export function sigmoid(value: number): number {
  if (value > 20) return 1;
  if (value < -20) return 0;
  return 1 / (1 + Math.exp(-value));
}

export function scoreWeights(features: SparseFeature[], weights: number[], bias: number): number {
  let total = bias;
  for (const feature of features) {
    total += (weights[feature.index] ?? 0) * feature.value;
  }
  return sigmoid(total);
}
