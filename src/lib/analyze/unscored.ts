import type { ScoreCard } from "./score";
import { embedText } from "../embed/hashing";
import type { ImageMetadataReport } from "../media/metadata";
import { applyImageReport, detectAiText } from "../model/ai-text";

/**
 * Kolom hoax_score di basis data tidak boleh kosong.
 * Angka 0 di sini hanya pengisi kolom. Antarmuka wajib membaca `unscored`
 * dan tidak menampilkan 0% sebagai skor hoaks.
 */

export const UNSCORED_IMAGE_REASON =
  "Belum bisa dinilai. Gambar tidak punya teks yang bisa diekstrak, dan keterangan tidak diisi. Metadata berkas tidak dipakai sebagai klaim.";

export const UNSCORED_SHORT_CAPTION_REASON =
  "Belum bisa dinilai. Keterangan yang ditempel terlalu pendek, dan gambar tidak punya teks yang bisa diekstrak. Metadata berkas tidak dipakai sebagai klaim.";

export const UNSCORED_NEXT_STEP =
  "Jangan memakai angka untuk berkas ini. Tempel keterangan gambar bila ingin teks itu dinilai. Keputusan tetap pada analis.";

export function unscoredImageCard(image: ImageMetadataReport, reason: string): ScoreCard {
  const ai = applyImageReport(detectAiText(""), image);
  return {
    clean: reason,
    assessment: {
      probability: 0,
      engine: "heuristic",
      modelVersion: "belum-dinilai",
      indobert: null,
      linear: null,
      heuristic: { probability: 0, reasons: [] },
      ai,
      modelStatus: "dilewati",
      unscored: { reason, nextStep: UNSCORED_NEXT_STEP },
    },
    topics: [],
    sensitivity: 0,
    virality: 0,
    risk: 0,
    band: "pantau",
    matches: [],
    embedding: embedText(""),
  };
}

export function assessmentIsUnscored(assessment: { unscored?: { reason?: string } | null } | null | undefined): boolean {
  return Boolean(assessment?.unscored?.reason);
}
