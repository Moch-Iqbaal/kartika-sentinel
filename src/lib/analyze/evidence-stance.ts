/**
 * Arah bukti untuk vonis. Bukan skor.
 * "Cek fakta" sebagai nama rubrik bukan label benar.
 * "Bukan hoaks" tidak dihitung sebagai bukti hoaks.
 * Artikel lama tidak dihitung sebagai berita penguat, kecuali kemiripannya sangat tinggi.
 */

import { countsAsPrimary } from "../factcheck/recency";
import { MATCH_MIN_SIMILARITY } from "../factcheck/threshold";

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
  "kumparan.com",
  "suarasurabaya.net",
  "suara.com",
  "matranews.id",
  "aktual.com",
  "tirto.id",
  "okezone.com",
  "sindonews.com",
  "jpnn.com",
  "beritasatu.com",
  "inews.id",
  "rri.co.id",
  "tvri.go.id",
  "kontan.co.id",
  "bisnis.com",
  "katadata.co.id",
  "jawapos.com",
  "viva.co.id",
  "merdeka.com",
  "idntimes.com",
  "tni.mil.id",
  "polri.go.id",
  "kemhan.go.id",
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
  "kumparan",
  "suara",
  "tirto",
  "okezone",
  "sindonews",
  "jpnn",
  "beritasatu",
  "inews",
  "rri",
  "tvri",
  "kontan",
  "bisnis",
  "katadata",
  "jawapos",
  "viva",
  "merdeka",
  "idntimes",
  "tnimil",
  "polri",
  "kemhan",
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
  if (key.includes("cnbcindonesia")) return "CNBC Indonesia";
  if (key.includes("metrotv")) return "Metro TV";
  if (key.includes("tvone")) return "tvOne";
  if (key.includes("tribun")) return "Tribun";
  if (key.includes("republika")) return "Republika";
  if (key.includes("mediaindonesia")) return "Media Indonesia";
  if (key.includes("antara")) return "Antara";
  if (key.includes("kumparan")) return "Kumparan";
  if (key.includes("suara")) return "Suara";
  if (key.includes("tirto")) return "Tirto";
  if (key.includes("okezone")) return "Okezone";
  if (key.includes("sindonews")) return "Sindonews";
  if (key.includes("jpnn")) return "JPNN";
  if (key.includes("beritasatu")) return "BeritaSatu";
  if (key.includes("inews")) return "iNews";
  if (key.includes("rri")) return "RRI";
  if (key.includes("tvri")) return "TVRI";
  if (key.includes("kontan")) return "Kontan";
  if (key.includes("bisnis")) return "Bisnis";
  if (key.includes("katadata")) return "Katadata";
  if (key.includes("jawapos")) return "Jawa Pos";
  if (key.includes("viva")) return "Viva";
  if (key.includes("merdeka")) return "Merdeka";
  if (key.includes("idntimes")) return "IDN Times";
  if (key.includes("tnimil") || key.includes("tnimilid")) return "situs resmi TNI";
  if (key.includes("kemhan")) return "situs resmi Kemhan";
  if (key.includes("polri")) return "situs resmi Polri";
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
    if (key.includes(marker)) {
      if (marker === "kompastv") return "kompas";
      if (marker === "tribunnews") return "tribun";
      if (marker === "tnimil") return "mil";
      return marker;
    }
  }
  if (key.includes("polri")) return "polri";
  if (key.includes("milid") || key.includes("tnimil")) return "mil";
  if (key.includes("kemhan")) return "gov";
  if (key.includes("goid")) return "gov";
  if (key.includes("mediaindonesia")) return "mediaindonesia";
  return null;
}

/** Byline portal di 3 baris awal, mis. "TEMPO.CO, Jakarta" atau "Kompas.com -". */
function bylineMarker(text: string): string | null {
  const head = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n")
    .toLowerCase();
  const patterns: Array<[RegExp, string]> = [
    [/\btempo\.co\b/, "tempo"],
    [/\bkompas\.com\b/, "kompas"],
    [/\bkompas\.tv\b/, "kompas"],
    [/\bdetik\.com\b/, "detik"],
    [/\bcnn\s*indonesia\b/, "cnnindonesia"],
    [/\bantaranews\.com\b|\(antara\)|antara news/, "antara"],
    [/\btribunnews\.com\b/, "tribun"],
    [/\bliputan6\.com\b/, "liputan6"],
    [/\brepublika\.co\.id\b/, "republika"],
    [/\btvonenews\.com\b/, "tvone"],
    [/\bmetrotvnews\.com\b/, "metrotv"],
    [/\bcnbcindonesia\.com\b/, "cnbcindonesia"],
    [/\bmediaindonesia\.com\b/, "mediaindonesia"],
    [/\btirto\.id\b/, "tirto"],
    [/\bokezone\.com\b/, "okezone"],
    [/\bsindonews\.com\b/, "sindonews"],
    [/\bjpnn\.com\b/, "jpnn"],
    [/\bviva\.co\.id\b/, "viva"],
    [/\bmerdeka\.com\b/, "merdeka"],
    [/\bidntimes\.com\b/, "idntimes"],
    [/\bjawapos\.com\b/, "jawapos"],
  ];
  for (const [pattern, marker] of patterns) {
    if (pattern.test(head)) return marker;
  }
  return null;
}

/** Penanda media asal teks. Kanal, domain, dan byline adalah asal, bukan penguat. */
export function originMarker(sourceUrl: string | null | undefined, text: string): string | null {
  const fromChannel = markerFromKey(channelKey(text));
  if (fromChannel) return fromChannel;
  if (sourceUrl) {
    try {
      const fromHost = markerFromKey(new URL(sourceUrl).hostname.toLowerCase().replace(/[^a-z0-9]+/g, ""));
      if (fromHost) return fromHost;
    } catch {
      // URL rusak bukan bukti.
    }
  }
  return bylineMarker(text);
}


function publisherMarker(publisher: string | null | undefined, source: string | null | undefined): string | null {
  const blob = `${publisher ?? ""} ${source ?? ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return markerFromKey(blob);
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

export type IndependentReport = {
  name: string;
  href: string | null;
  /** Boleh mengubah vonis. Artikel lama yang tidak hampir sama tetap false. */
  primary: boolean;
  publishedAt: string | null;
  similarity: number;
};

/**
 * Berita dari media lain, bukan kanal atau situs yang menjadi asal teks.
 * Pemeriksaan fakta yang berlabel hoaks tidak dihitung sebagai berita penguat.
 * Artikel yang jauh lebih tua dari berita ini tidak menjadi penguat, kecuali klaimnya hampir sama.
 */
export function independentReports(
  sourceUrl: string | null | undefined,
  text: string,
  facts: {
    source: string;
    title: string;
    url: string | null;
    rating: string | null;
    publisher: string | null;
    publishedAt?: string | null;
    similarity?: number | null;
  }[],
  options?: { contentPublishedAt?: string | null; now?: Date },
): IndependentReport[] {
  const origin = originMarker(sourceUrl, text);
  const ownName = credibleLabel(sourceUrl, text);
  const now = options?.now ?? new Date();
  const contentPublishedAt = options?.contentPublishedAt ?? null;
  const found: IndependentReport[] = [];
  for (const fact of facts) {
    if (evidenceStance(fact.rating) === "hoax") continue;
    const marker = factHostMarker(fact.url) ?? publisherMarker(fact.publisher, fact.source);
    if (!marker || marker === origin) continue;
    let host = "";
    try {
      host = new URL(fact.url ?? "").hostname;
    } catch {
      continue;
    }
    // Google News kadang hanya punya tautan google; pakai penanda penerbit.
    const name = labelFromHost(host) ?? labelFromKey(marker);
    if (!name || found.some((item) => item.name === name)) continue;
    // Nama outlet sama dengan asal teks tidak pernah jadi penguat.
    if (ownName && name.toLowerCase() === ownName.toLowerCase()) continue;
    const similarity = fact.similarity ?? 0;
    // Berita penguat harus cukup mirip; hindari CNN soal topik lain ikut terhitung.
    if (similarity < MATCH_MIN_SIMILARITY) continue;
    const publishedAt = fact.publishedAt ?? null;
    found.push({
      name,
      href: fact.url,
      publishedAt,
      similarity,
      primary: countsAsPrimary(similarity, publishedAt, contentPublishedAt, now),
    });
  }
  return found;
}
