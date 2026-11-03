/**
 * Sinyal gaya bahasa, bukan model bahasa dan bukan perplexity neural.
 * "Keteraturan" dihitung dari panjang kalimat dan keberagaman kata.
 * Nilainya penjelasan untuk analis, bukan bukti teks dihasilkan mesin.
 */

export type StyleSignal = {
  name: string;
  detail: string;
  weight: number;
};

function sentencesOf(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

export function stylometrySignals(text: string): StyleSignal[] {
  const sentences = sentencesOf(text);
  const words = wordsOf(text);
  const signals: StyleSignal[] = [];
  if (sentences.length < 4 || words.length < 40) {
    return signals;
  }
  const lengths = sentences.map((sentence) => sentence.split(/\s+/).length);
  const mean = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  const variance = lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lengths.length;
  const burstiness = Math.sqrt(variance) / Math.max(mean, 1);
  if (burstiness < 0.22) {
    signals.push({
      name: "panjang kalimat seragam",
      detail: `Simpangan panjang kalimat relatif ${burstiness.toFixed(2)}. Teks manusia sering lebih tidak rata. Ini indikasi gaya, bukan bukti.`,
      weight: 0.12,
    });
  }
  const unique = new Set(words).size / words.length;
  if (unique < 0.45) {
    signals.push({
      name: "keberagaman kata rendah",
      detail: `Rasio kata unik ${unique.toFixed(2)}. Pengulangan kosakata bisa muncul pada teks templat, termasuk teks buatan.`,
      weight: 0.1,
    });
  }
  const hedges = ["selain itu", "dengan demikian", "perlu dicatat", "secara keseluruhan", "tidak hanya"];
  const hits = hedges.filter((phrase) => text.toLowerCase().includes(phrase));
  if (hits.length >= 2) {
    signals.push({
      name: "penanda transisi berulang",
      detail: `Frasa transisi: ${hits.join(", ")}. Pola ini sering, tetapi tidak selalu, muncul pada keluaran model bahasa.`,
      weight: 0.08,
    });
  }
  return signals;
}
