import type { Confusion } from "./report";

/** Ringkasan bahasa biasa. Semua angka dihitung dari matriks, tidak diketik tangan. */
export type PlainEval = {
  n: number;
  correct: number;
  percent: number;
  falseAlarm: number;
  missed: number;
  headline: string;
  takeaway: string;
};

export function wholePercent(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export function plainEval(confusion: Confusion): PlainEval {
  const n = confusion.tp + confusion.tn + confusion.fp + confusion.fn;
  const correct = confusion.tp + confusion.tn;
  const percent = wholePercent(correct, n);
  const falseAlarm = confusion.fp;
  const missed = confusion.fn;
  const headline = `Dari ${n} berita uji, ${correct} ditebak benar (${percent}%).`;
  let takeaway: string;
  if (missed > falseAlarm) {
    takeaway = `Kecolongan lebih sering: ${missed} hoaks lolos, sementara salah tuduh ${falseAlarm}.`;
  } else if (falseAlarm > missed) {
    takeaway = `Salah tuduh lebih sering: ${falseAlarm} berita benar dibilang hoaks, sementara kecolongan ${missed}.`;
  } else {
    takeaway = `Salah tuduh dan kecolongan sama banyak, masing-masing ${falseAlarm}.`;
  }
  return { n, correct, percent, falseAlarm, missed, headline, takeaway };
}
