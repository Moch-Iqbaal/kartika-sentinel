export type AiTextFlag = {
  flagged: boolean;
  score: number;
  reasons: string[];
  disclaimer: string;
};

const DISCLAIMER =
  "Indikasi heuristik, bukan deteksi deepfake. Tidak ada model penghasil-teks yang dijalankan di sini. Analis harus memeriksa berkas asli.";

/**
 * Bendera media/teks mungkin buatan AI.
 * Model shouwiku/detectai-indonesian (MIT) disebut di dokumentasi sebagai
 * peningkatan on-premise, tetapi tidak dipanggil lewat jaringan.
 */
export function detectAiText(text: string): AiTextFlag {
  const lower = text.toLowerCase();
  const reasons: string[] = [];
  let score = 0.08;

  const cues: Array<[string, number, string]> = [
    ["deepfake", 0.42, "Teks menyebut deepfake."],
    ["buatan ai", 0.36, "Teks menyebut buatan AI."],
    ["hasil ai", 0.32, "Teks menyebut hasil AI."],
    ["generate ai", 0.34, "Teks menyebut generate AI."],
    ["generated", 0.16, "Ada kata generated."],
    ["wajah kaku", 0.22, "Ada deskripsi visual yang sering menempel pada video sintetis."],
    ["suara tidak sinkron", 0.22, "Ada keluhan sinkronisasi suara."],
    ["rekaman eksklusif", 0.1, "Klaim rekaman eksklusif tanpa sumber primer."],
    ["bocoran video", 0.12, "Pola bocoran video."],
  ];
  for (const [needle, weight, reason] of cues) {
    if (lower.includes(needle)) {
      score += weight;
      reasons.push(reason);
    }
  }

  const sentences = text
    .split(/[.!?]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const short = sentences.filter((part) => part.split(/\s+/).length <= 8);
  if (sentences.length >= 4 && short.length / sentences.length >= 0.7) {
    score += 0.16;
    reasons.push("Banyak kalimat sangat pendek beruntun, pola yang sering dipakai narasi video sintetis.");
  }
  if (/(video|rekaman)/.test(lower) && /(viral|heboh|sebarkan)/.test(lower) && !/(rilis|kapuspen|menurut)/.test(lower)) {
    score += 0.1;
    reasons.push("Klaim video viral tanpa penanda sumber resmi.");
  }

  const capped = Math.min(0.95, score);
  if (reasons.length === 0) {
    reasons.push("Tidak ada penanda heuristik yang kuat.");
  }
  return {
    flagged: capped >= 0.45,
    score: capped,
    reasons,
    disclaimer: DISCLAIMER,
  };
}
