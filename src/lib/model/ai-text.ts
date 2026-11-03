import type { ImageMetadataReport } from "../media/metadata";
import { stylometrySignals } from "./stylometry";

export type AiConfidence = "rendah" | "sedang" | "tinggi";

export type AiTextFlag = {
  flagged: boolean;
  score: number;
  confidence: AiConfidence;
  reasons: string[];
  signals: { name: string; detail: string }[];
  disclaimer: string;
};

const DISCLAIMER =
  "Indikasi gaya dan metadata, bukan deteksi deepfake dan bukan perplexity model bahasa. Keyakinan rendah berarti sinyal lemah. Analis harus melihat berkas asli.";

function confidenceOf(score: number): AiConfidence {
  if (score >= 0.62) return "tinggi";
  if (score >= 0.4) return "sedang";
  return "rendah";
}

function cues(text: string): { name: string; detail: string; weight: number }[] {
  const lower = text.toLowerCase();
  const rows: Array<[string, number, string]> = [
    ["deepfake", 0.28, "Teks menyebut deepfake."],
    ["buatan ai", 0.24, "Teks menyebut buatan AI."],
    ["hasil ai", 0.2, "Teks menyebut hasil AI."],
    ["generate ai", 0.22, "Teks menyebut generate AI."],
  ];
  return rows
    .filter(([needle]) => lower.includes(needle))
    .map(([name, weight, detail]) => ({ name, weight, detail }));
}

/** Gabungan isyarat leksikal dan stilometri. Skor dibatasi dan dijelaskan. */
export function detectAiText(text: string): AiTextFlag {
  const found = [...cues(text), ...stylometrySignals(text)];
  let score = found.reduce((sum, item) => sum + item.weight, 0.06);
  const sentences = text.split(/[.!?]/).map((part) => part.trim()).filter(Boolean);
  const short = sentences.filter((part) => part.split(/\s+/).length <= 8);
  if (sentences.length >= 4 && short.length / sentences.length >= 0.75) {
    score += 0.1;
    found.push({
      name: "kalimat sangat pendek",
      detail: "Banyak kalimat sangat pendek beruntun. Pola ini umum pada narasi video, termasuk yang sintetis.",
      weight: 0.1,
    });
  }
  const capped = Math.min(0.9, score);
  const confidence = confidenceOf(capped);
  return {
    flagged: confidence !== "rendah" && found.length > 0,
    score: capped,
    confidence,
    reasons: found.map((item) => item.detail),
    signals: found.map((item) => ({ name: item.name, detail: item.detail })),
    disclaimer: DISCLAIMER,
  };
}

export function applyImageReport(flag: AiTextFlag, image: ImageMetadataReport | null): AiTextFlag {
  if (!image?.checked) return flag;
  const reasons = [...flag.reasons, ...image.signals];
  let score = flag.score;
  if (image.generatorHint) score = Math.min(0.9, score + 0.34);
  else if (image.c2paMarker) score = Math.min(0.9, score + 0.08);
  const confidence = image.generatorHint ? "tinggi" : confidenceOf(score);
  return {
    flagged: Boolean(image.generatorHint) || confidence !== "rendah",
    score,
    confidence,
    reasons,
    signals: [
      ...flag.signals,
      ...image.signals.map((detail) => ({ name: image.generatorHint ? "metadata pembuat" : "metadata", detail })),
    ],
    disclaimer: `${flag.disclaimer} ${image.disclaimer}`,
  };
}
