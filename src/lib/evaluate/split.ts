/**
 * Pembagian yang sama dengan scripts/train-linear.ts:
 * seed 2026, 80 persen latih, sisanya hold-out.
 * Evaluasi membuang teks hold-out yang juga ada di potongan latih.
 */

export type LabeledRow = {
  index: number;
  text: string;
  y: 0 | 1;
};

export function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rand: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function holdoutSplit<T>(items: T[], seed: number, trainFraction = 0.8): { train: T[]; holdout: T[] } {
  const ordered = shuffle(items, mulberry32(seed));
  const cut = Math.floor(ordered.length * trainFraction);
  return { train: ordered.slice(0, cut), holdout: ordered.slice(cut) };
}

export function withoutTrainText<T extends { text: string }>(train: T[], holdout: T[]): { kept: T[]; dropped: number } {
  const seen = new Set(train.map((item) => item.text));
  const kept = holdout.filter((item) => !seen.has(item.text));
  return { kept, dropped: holdout.length - kept.length };
}
