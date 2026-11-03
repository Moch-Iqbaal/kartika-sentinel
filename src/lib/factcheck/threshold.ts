/** Di bawah angka ini padanan tidak ditampilkan. 0,40 = 40 persen. */
export const MATCH_MIN_SIMILARITY = 0.4;

export const NO_STRONG_MATCH = "Tidak ada padanan kuat";

export function strongMatches<T extends { similarity: number }>(items: T[]): T[] {
  return items.filter((item) => Number.isFinite(item.similarity) && item.similarity >= MATCH_MIN_SIMILARITY);
}
