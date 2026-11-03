/**
 * Arah bukti untuk vonis. Bukan skor.
 * "Cek fakta" sebagai nama rubrik bukan label benar.
 * "Bukan hoaks" tidak dihitung sebagai bukti hoaks.
 */

export type EvidenceStance = "hoax" | "valid" | "none";

const CREDIBLE_HOSTS = [
  "kompas.com",
  "kompas.tv",
  "kompas.id",
  "detik.com",
  "tempo.co",
  "antaranews.com",
  "liputan6.com",
  "cnnindonesia.com",
  "metrotvnews.com",
  "tribunnews.com",
  "republika.co.id",
  "mediaindonesia.com",
  "tvonenews.com",
  "cnbcindonesia.com",
];

const NEWSROOM_MARKERS = [
  "kompastv",
  "kompas",
  "detik",
  "tempo",
  "antara",
  "liputan6",
  "cnnindonesia",
  "metrotv",
  "tvone",
  "tribunnews",
  "republika",
];

export function evidenceStance(value: string | null | undefined): EvidenceStance {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return "none";
  if (/bukan\s+hoax|bukan\s+hoaks|tidak\s+hoaks|not\s+hoax/.test(raw)) return "valid";
  const text = raw.replace(/cek\s*fakta/g, " ");
  if (/(^|[^a-z])(hoax|hoaks|misleading|menyesatkan|salah|keliru)([^a-z]|$)/.test(text)) return "hoax";
  if (/(^|[^a-z])(true|fakta|benar|valid)([^a-z]|$)/.test(text)) return "valid";
  return "none";
}

function hostMatches(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host.endsWith(".mil.id") || host.endsWith(".go.id")) return true;
  return CREDIBLE_HOSTS.some((item) => host === item || host.endsWith(`.${item}`));
}

/** URL media/lembaga resmi, atau baris kanal video dari ruang redaksi yang dikenal. */
export function credibleReporting(sourceUrl: string | null | undefined, text: string): boolean {
  if (sourceUrl) {
    try {
      if (hostMatches(new URL(sourceUrl).hostname)) return true;
    } catch {
      // URL rusak bukan bukti.
    }
  }
  const channel = text.match(/(?:^|\n)Kanal:\s*(.+)/)?.[1] ?? "";
  const normalized = channel.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!normalized) return false;
  return NEWSROOM_MARKERS.some((marker) => normalized.includes(marker));
}
