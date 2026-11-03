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
  "tribun",
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

function channelKey(text: string): string {
  const channel = text.match(/(?:^|\n)Kanal:\s*(.+)/)?.[1] ?? "";
  return channel.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function labelFromKey(key: string): string | null {
  if (!key) return null;
  if (key.includes("kompastv")) return "Kompas TV";
  if (key.includes("kompas")) return "Kompas";
  if (key.includes("detik")) return "Detik";
  if (key.includes("tempo")) return "Tempo";
  if (key.includes("liputan6")) return "Liputan6";
  if (key.includes("cnnindonesia")) return "CNN Indonesia";
  if (key.includes("metrotv")) return "Metro TV";
  if (key.includes("tvone")) return "tvOne";
  if (key.includes("tribun")) return "Tribun";
  if (key.includes("republika")) return "Republika";
  if (key.includes("antara")) return "Antara";
  return null;
}

function labelFromHost(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host.endsWith(".polri.go.id") || host.includes("polri")) return "situs resmi Polri";
  if (host.endsWith(".mil.id")) return "situs resmi TNI";
  if (host.endsWith(".go.id")) return "situs resmi pemerintah";
  return labelFromKey(host.replace(/[^a-z0-9]+/g, ""));
}

/** Nama media atau lembaga yang memberitakan teks ini. Kosong bila tidak dikenali. */
export function credibleLabel(sourceUrl: string | null | undefined, text: string): string | null {
  if (sourceUrl) {
    try {
      const host = new URL(sourceUrl).hostname;
      if (hostMatches(host)) {
        const named = labelFromHost(host);
        if (named) return named;
      }
    } catch {
      // URL rusak bukan bukti.
    }
  }
  const fromChannel = labelFromKey(channelKey(text));
  if (!fromChannel) return null;
  if (!NEWSROOM_MARKERS.some((marker) => channelKey(text).includes(marker))) return null;
  return fromChannel;
}

/** URL media/lembaga resmi, atau baris kanal video dari ruang redaksi yang dikenal. */
export function credibleReporting(sourceUrl: string | null | undefined, text: string): boolean {
  return credibleLabel(sourceUrl, text) != null;
}

function markerFromKey(key: string): string | null {
  if (!key) return null;
  for (const marker of NEWSROOM_MARKERS) {
    if (key.includes(marker)) return marker === "kompastv" ? "kompas" : marker === "tribunnews" ? "tribun" : marker;
  }
  if (key.includes("polri")) return "polri";
  if (key.includes("milid")) return "mil";
  if (key.includes("goid")) return "gov";
  return null;
}

/** Penanda media asal teks. Kanal video dan domain artikel adalah asal, bukan penguat. */
export function originMarker(sourceUrl: string | null | undefined, text: string): string | null {
  const fromChannel = markerFromKey(channelKey(text));
  if (fromChannel) return fromChannel;
  if (!sourceUrl) return null;
  try {
    return markerFromKey(new URL(sourceUrl).hostname.toLowerCase().replace(/[^a-z0-9]+/g, ""));
  } catch {
    return null;
  }
}

function factHostMarker(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (/turnbackhoax|cekfakta/.test(host)) return null;
    if (!hostMatches(host)) return null;
    return markerFromKey(host.replace(/[^a-z0-9]+/g, ""));
  } catch {
    return null;
  }
}

/**
 * Berita dari media lain, bukan kanal atau situs yang menjadi asal teks.
 * Pemeriksaan fakta yang berlabel hoaks tidak dihitung sebagai berita penguat.
 */
export function independentReports(
  sourceUrl: string | null | undefined,
  text: string,
  facts: { source: string; title: string; url: string | null; rating: string | null; publisher: string | null }[],
): { name: string; href: string | null }[] {
  const origin = originMarker(sourceUrl, text);
  const found: { name: string; href: string | null }[] = [];
  for (const fact of facts) {
    if (evidenceStance(fact.rating) === "hoax") continue;
    const marker = factHostMarker(fact.url);
    if (!marker || marker === origin) continue;
    let host = "";
    try {
      host = new URL(fact.url ?? "").hostname;
    } catch {
      continue;
    }
    const name = labelFromHost(host);
    if (!name || found.some((item) => item.name === name)) continue;
    found.push({ name, href: fact.url });
  }
  return found;
}
