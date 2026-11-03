/**
 * Penyematan lokal untuk pencocokan topik dan cek fakta.
 *
 * Ini bukan embedding neural. Setiap token di-hash ke salah satu dari
 * EMBED_DIM slot (feature hashing) dengan tanda +/- lalu vektor dinormalisasi
 * L2. Kemiripan = kosinus. Dimensi ini harus sama dengan vector(128) di migrasi
 * Supabase. Tidak ada panggilan jaringan.
 */

export const EMBED_DIM = 128;

const STOP = new Set([
  "yang", "dan", "di", "ke", "dari", "ini", "itu", "untuk", "dengan", "pada",
  "ada", "juga", "akan", "atau", "sebagai", "tidak", "tak", "adalah", "dalam",
  "oleh", "atas", "sudah", "telah", "para", "bagi", "sebuah", "suatu", "the",
  "of", "to", "a", "in",
]);

export function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function contentTokens(text: string): string[] {
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

/** Vektor rapat ternormalisasi, panjangnya selalu EMBED_DIM. */
export function embedText(text: string): number[] {
  const bins = new Float64Array(EMBED_DIM);
  for (const token of contentTokens(text)) {
    const slot = fnv1a(`e:${token}`) % EMBED_DIM;
    const sign = (fnv1a(`s:${token}`) & 1) === 0 ? 1 : -1;
    bins[slot] += sign;
  }
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i += 1) norm += bins[i] * bins[i];
  norm = Math.sqrt(norm);
  const out = new Array<number>(EMBED_DIM);
  for (let i = 0; i < EMBED_DIM; i += 1) {
    out[i] = norm === 0 ? 0 : bins[i] / norm;
  }
  return out;
}

export function cosine(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < length; i += 1) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}
