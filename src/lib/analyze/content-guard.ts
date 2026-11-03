/**
 * Teks sistem tidak boleh masuk mesin skor.
 * Kalimat di bawah ini dibuat aplikasi (metadata gambar, penolakan OCR),
 * bukan klaim yang ditempel analis.
 */

export class NonContentTextError extends Error {
  constructor(message = "Teks sistem atau metadata tidak dinilai sebagai klaim.") {
    super(message);
    this.name = "NonContentTextError";
  }
}

const SYSTEM_MARKERS = [
  "Berkas gambar image/",
  "Tidak ada nama pembuat atau penanda C2PA yang dikenali.",
  "Byte berkas memuat nama pembuat",
  "Tag Software terbaca:",
  "Ada rangkaian byte c2pa atau jumbf.",
  "Pemeriksaan ini hanya membaca metadata dan rangkaian byte.",
  "Metadata kosong tidak membuktikan gambar itu asli.",
  "Belum bisa dinilai.",
];

export function isNonContentText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return SYSTEM_MARKERS.some((marker) => trimmed.includes(marker));
}

export function assertScorableText(text: string): void {
  if (isNonContentText(text)) throw new NonContentTextError();
}
