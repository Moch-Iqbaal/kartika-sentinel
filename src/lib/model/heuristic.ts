export type HeuristicScore = {
  probability: number;
  reasons: string[];
};

const SENSATIONAL = [
  "viral", "mengejutkan", "terbongkar", "rahasia", "sebarkan", "viralkan",
  "heboh", "gempar", "darurat", "waspada", "share", "menyebar", "wajib sebar",
];
const UNSOURCED = [
  "katanya", "konon", "sumber internal", "kabar beredar", "info rahasia",
  "diduga kuat", "tanpa sumber", "jangan tanya",
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Skor leksikal yang bisa dijelaskan. Bukan keputusan fakta. */
export function heuristicHoax(text: string): HeuristicScore {
  const lower = text.toLowerCase();
  const reasons: string[] = [];
  let score = 0.22;

  const sensational = SENSATIONAL.filter((word) => lower.includes(word));
  if (sensational.length > 0) {
    score += Math.min(0.3, 0.08 * sensational.length);
    reasons.push(`Bahasa sensasi atau ajakan sebar: ${sensational.slice(0, 4).join(", ")}.`);
  }
  const unsourced = UNSOURCED.filter((word) => lower.includes(word));
  if (unsourced.length > 0) {
    score += Math.min(0.18, 0.07 * unsourced.length);
    reasons.push(`Atribusi lemah: ${unsourced.slice(0, 3).join(", ")}.`);
  }
  if (/(?:20[\s.]?000|20 ribu|ratusan pesawat|500 pesawat)/.test(lower) && /(tni|pasukan|prajurit)/.test(lower)) {
    score += 0.12;
    reasons.push("Angka besar menggantung pada klaim militer, tanpa rujukan primer di teks.");
  }
  const letters = text.replace(/[^A-Za-z]/g, "");
  const caps = text.replace(/[^A-Z]/g, "");
  if (letters.length > 30 && caps.length / letters.length > 0.45) {
    score += 0.08;
    reasons.push("Proporsi huruf kapital tinggi.");
  }
  if (/!{2,}/.test(text) || (text.match(/!/g) || []).length >= 3) {
    score += 0.05;
    reasons.push("Tanda seru berulang.");
  }
  if (/(menurut keterangan|menurut rilis|kapuspen|situs resmi|keterangan tertulis)/.test(lower)) {
    score -= 0.14;
    reasons.push("Ada penanda nada rilis resmi. Skor heuristik diturunkan, tetap perlu dibaca manusia.");
  }
  if (reasons.length === 0) {
    reasons.push("Tidak ada pola leksikal yang menonjol. Skor dekat prior rendah.");
  }
  return { probability: clamp(score, 0.03, 0.97), reasons };
}
