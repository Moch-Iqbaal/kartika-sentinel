/**
 * Teks URL yang terlalu pendek tidak boleh tampil sebagai hoaks "hampir pasti".
 *
 * Halaman yang hanya menyerahkan judul (atau ekstraksi yang gagal) membuat
 * model n-gram terlalu yakin. Di bawah ambang, jarak skor dari 50% dipotong
 * menjadi seperempatnya:
 *
 *   p' = 0,5 + (p − 0,5) × 0,25
 *
 * Contoh: 99,9% menjadi sekitar 62,5%. Angka mentah disimpan terpisah supaya
 * analis tetap melihat keluaran mesin, tetapi skor utama yang diarsipkan
 * adalah angka yang sudah diturunkan. Peringatan wajib ditampilkan.
 */

export const MIN_RELIABLE_CHARS = 200;
export const MIN_RELIABLE_WORDS = 20;
export const SHORT_TEXT_WARNING = "Teks terlalu pendek, skor tidak andal.";
export const SHORT_WORD_VERDICT = "Teks terlalu pendek, belum bisa dinilai";

/** Sisa keyakinan yang dipertahankan bila tubuh artikel di bawah ambang. */
export const SHORT_TEXT_KEEP = 0.25;

export type ShortTextNote = {
  warning: string;
  bodyChars: number;
  rawProbability: number;
  probability: number;
  /** Terisi bila pemicu utamanya jumlah kata, bukan panjang tubuh URL. */
  words?: number;
};

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function dampenShortTextProbability(probability: number): number {
  const p = clamp01(probability);
  return 0.5 + (p - 0.5) * SHORT_TEXT_KEEP;
}

/**
 * `bodyChars` adalah panjang tubuh artikel, tanpa judul.
 * Judul yang panjang tidak boleh menyembunyikan tubuh yang gagal diekstrak.
 * Mengembalikan null bila teks cukup panjang sehingga skor tidak diubah.
 */
/** Semua masukan: di bawah 20 kata, skor ditarik ke 50%. */
export function shortWordCaution(text: string, probability: number): ShortTextNote | null {
  const words = wordCount(text);
  if (words >= MIN_RELIABLE_WORDS) return null;
  const raw = clamp01(probability);
  return {
    warning: SHORT_WORD_VERDICT,
    bodyChars: text.trim().length,
    words,
    rawProbability: raw,
    probability: dampenShortTextProbability(raw),
  };
}

export function shortTextCaution(bodyChars: number, probability: number): ShortTextNote | null {
  if (!Number.isFinite(bodyChars) || bodyChars >= MIN_RELIABLE_CHARS) return null;
  const raw = clamp01(probability);
  return {
    warning: SHORT_TEXT_WARNING,
    bodyChars: Math.max(0, Math.floor(bodyChars)),
    rawProbability: raw,
    probability: dampenShortTextProbability(raw),
  };
}
