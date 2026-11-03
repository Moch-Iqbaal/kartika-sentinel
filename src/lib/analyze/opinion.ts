/**
 * Isyarat opini atau kritik kebijakan. Bukan klasifikasi hoaks.
 * Catatan pendek disimpan di berkas. Kalimat di Ringkasan ada di OPINION_SENTENCE.
 */

export const OPINION_NOTE = "kritik kebijakan bukan hoaks";
export const OPINION_SENTENCE = "Isinya terbaca sebagai kritik kebijakan, dan kritik bukan hoaks.";

const CUES = ["kritik", "menilai", "tak selaras", "tidak selaras", "menurut"];

const QUOTE = /["“«']([^"”»']{3,80})["”»']/g;
const ORG = /\b(?:lembaga|koalisi|yayasan|komnas|aliansi|perhimpunan|imparsial|kontras|ylbhi|walhi)\b/i;

export type OpinionMark = {
  cues: string[];
  note: typeof OPINION_NOTE;
};

export function detectOpinion(text: string): OpinionMark | null {
  const lower = text.toLowerCase();
  const cues = CUES.filter((cue) => lower.includes(cue));
  if (quotedOrg(text)) cues.push("nama lembaga dalam kutipan");
  if (cues.length === 0) return null;
  return { cues, note: OPINION_NOTE };
}

function quotedOrg(text: string): boolean {
  for (const match of text.matchAll(QUOTE)) {
    const inner = match[1].trim();
    if (ORG.test(inner)) return true;
    const words = inner.split(/\s+/).filter(Boolean);
    const titled = words.filter((word) => /^[A-ZÀ-Ž]/.test(word)).length;
    if (words.length >= 2 && titled >= 2) return true;
  }
  return false;
}
