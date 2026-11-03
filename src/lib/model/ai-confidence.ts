export type AiConfidence = "rendah" | "sedang" | "tinggi";

export const AI_TEXT_DISCLAIMER =
  "Indikasi gaya dan metadata, bukan deteksi deepfake dan bukan perplexity model bahasa. Keyakinan rendah berarti sinyal lemah. Analis harus melihat berkas asli.";

/** Ambang keyakinan indikasi AI. Di bawah sedang tetap rendah. Skor sendiri dijepit di AI_SCORE_CAP. */
export const AI_CONFIDENCE_TINGGI_MIN = 0.62;
export const AI_CONFIDENCE_SEDANG_MIN = 0.4;
export const AI_SCORE_CAP = 0.9;

export function aiConfidence(score: number): AiConfidence {
  if (score >= AI_CONFIDENCE_TINGGI_MIN) return "tinggi";
  if (score >= AI_CONFIDENCE_SEDANG_MIN) return "sedang";
  return "rendah";
}
