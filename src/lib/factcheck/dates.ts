const MONTHS: Record<string, string> = {
  januari: "01",
  februari: "02",
  maret: "03",
  april: "04",
  mei: "05",
  juni: "06",
  juli: "07",
  agustus: "08",
  september: "09",
  oktober: "10",
  november: "11",
  desember: "12",
};

/** YYYY-MM-DD. Teks tanggal Indonesia ("29 April 2025") ikut dibaca. */
export function normalizeFactDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const written = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!written) return null;
  const month = MONTHS[written[2].toLowerCase()];
  if (!month) return null;
  const day = written[1].padStart(2, "0");
  return `${written[3]}-${month}-${day}`;
}

/**
 * Tanggal terbit isi yang sedang dinilai.
 * YouTube: publishDate, lalu uploadDate.
 * Artikel: article:published_time atau itemprop datePublished.
 * Tidak mengarang tanggal bila tidak ada.
 */
export function parseContentDate(source: string): string | null {
  const patterns = [
    /"publishDate"\s*:\s*"([^"]+)"/,
    /property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']article:published_time["']/i,
    /itemprop=["']datePublished["'][^>]*(?:content|datetime)=["']([^"']+)["']/i,
    /(?:content|datetime)=["']([^"']+)["'][^>]*itemprop=["']datePublished["']/i,
    /"uploadDate"\s*:\s*"([^"]+)"/,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    const iso = normalizeFactDate(match?.[1]);
    if (iso) return iso;
  }
  return null;
}
