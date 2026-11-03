import type { ScoreCard } from "@/lib/analyze/score";
import { shortTextCaution, shortWordCaution } from "@/lib/ingest/short-text";
import { computeRisk, riskBand } from "@/lib/scoring/risk";

/**
 * Bila tubuh artikel di bawah ambang, ganti skor utama dan risiko dengan
 * angka yang sudah diturunkan, lalu simpan keluaran mentah di `caution`.
 * Teks yang cukup panjang dikembalikan apa adanya.
 * `bodyChars` kosong berarti masukan ini bukan ekstraksi URL yang perlu diukur.
 */
export function applyShortTextCaution(card: ScoreCard, bodyChars: number | null | undefined): ScoreCard {
  const wordNote = shortWordCaution(card.clean, card.assessment.probability);
  const charNote = wordNote || bodyChars == null
    ? null
    : shortTextCaution(bodyChars, card.assessment.probability);
  const note = wordNote ?? charNote;
  if (!note) return card;
  const risk = computeRisk(note.probability, card.sensitivity, card.virality);
  const reasons = card.assessment.heuristic.reasons.filter((reason) => reason !== note.warning);
  return {
    ...card,
    risk,
    band: riskBand(risk),
    assessment: {
      ...card.assessment,
      probability: note.probability,
      caution: {
        warning: note.warning,
        bodyChars: note.bodyChars,
        rawProbability: note.rawProbability,
        words: note.words,
      },
      heuristic: {
        ...card.assessment.heuristic,
        reasons: [note.warning, ...reasons],
      },
    },
  };
}
