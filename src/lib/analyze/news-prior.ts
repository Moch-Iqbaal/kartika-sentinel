import { originMarker } from "./evidence-stance";

/**
 * Kanal atau domain berita yang dikenal, tanpa ajakan sebar.
 * Bukan bukti bahwa media lain memberitakan hal yang sama.
 * Hanya prior ringan: teks semacam ini tidak boleh jadi hoaks dari satu angka saja.
 */

const NEWSROOMS = new Set([
  "kompas",
  "detik",
  "tempo",
  "antara",
  "liputan6",
  "cnnindonesia",
  "metrotv",
  "tvone",
  "tribun",
  "republika",
]);

const HOAX_MARKERS = [
  "sebarkan",
  "sebarluaskan",
  "viralkan",
  "wajib sebar",
  "viral",
  "terbongkar",
  "heboh",
  "gempar",
  "waspada",
  "katanya",
  "konon",
  "sumber internal",
  "kabar beredar",
];

export function plainNewsReport(text: string, sourceUrl?: string | null): boolean {
  const origin = originMarker(sourceUrl ?? null, text);
  if (!origin || !NEWSROOMS.has(origin)) return false;
  const lower = text.toLowerCase();
  if (HOAX_MARKERS.some((word) => new RegExp(`(?:^|[^a-z])${word}(?:[^a-z]|$)`).test(lower))) return false;
  if (/(?:^|[^a-z])share(?:[^a-z]|$)/.test(lower)) return false;
  if (/(?:20[\s.]?000|20 ribu|ratusan pesawat|500 pesawat)/.test(lower) && /(tni|pasukan|prajurit)/.test(lower)) return false;
  const letters = text.replace(/[^A-Za-z]/g, "");
  const caps = text.replace(/[^A-Z]/g, "");
  if (letters.length > 30 && caps.length / letters.length > 0.45) return false;
  if ((text.match(/!/g) || []).length >= 3) return false;
  return true;
}
