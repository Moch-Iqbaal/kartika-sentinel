import { searchGoogleFactChecks } from "@/lib/factcheck/google";
import {
  claimQueries,
  dedupeFacts,
  googleNewsQueries,
  parseAntara,
  parseAntaraNews,
  parseCekfakta,
  parseDetikNews,
  parseDetikSearch,
  parseGenericNewsRss,
  parseGoogleNewsRss,
  parseKomdigi,
  parseKompasNews,
  parseKompasSearch,
  parseKumparanRss,
  parseLiputanRss,
  parseTempoRss,
  parseTirtoRss,
  parseTurnbackhoax,
  peerQueries,
  setPeerContentContext,
  urlFirstQueries,
} from "@/lib/factcheck/live-parse";
import type { ExternalFact } from "@/lib/factcheck/types";
import { safeFetchText } from "@/lib/security/ssrf";

/** Pencarian langsung. Masing-masing sumber punya batas waktu pendek. */
export const LIVE_FACT_TIMEOUT_MS = 4000;
export const LIVE_FACT_CACHE_MS = 10 * 60 * 1000;

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export type SourceProbe = {
  name: string;
  state: "hasil" | "kosong" | "ditolak" | "dilewati";
  detail?: string;
};

type CacheEntry = { at: number; facts: ExternalFact[]; sources: SourceProbe[] };
const cache = new Map<string, CacheEntry>();

async function grab(url: string, accept: string): Promise<{ body: string | null; blocked: string | null }> {
  try {
    const result = await safeFetchText(url, {
      accept,
      timeoutMs: LIVE_FACT_TIMEOUT_MS,
      userAgent: BROWSER_UA,
    });
    return { body: result.body, blocked: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "gagal";
    return { body: null, blocked: message.slice(0, 80) };
  }
}

type SourceSpec = {
  name: string;
  url: (query: string) => string;
  accept: string;
  parse: (body: string, query: string) => ExternalFact[];
  /** Satu unduhan untuk semua kueri (RSS). */
  once?: boolean;
  /** Tidak diunduh. Alasan jujur, bukan parser kosong. */
  skip?: string;
  /** Mode kueri: fakta (URL+klaim) atau berita penguat (entitas+judul). */
  mode?: "fact" | "peer" | "news";
};

function parseOutletRss(source: string, publisher: string) {
  return (body: string, query: string) =>
    parseGenericNewsRss(body, query, source, publisher, { requireFactCue: false });
}

const SOURCES: SourceSpec[] = [
  {
    name: "TurnBackHoax",
    url: (query) => `https://turnbackhoax.id/search?query=${encodeURIComponent(query)}`,
    accept: "application/json",
    parse: parseTurnbackhoax,
    mode: "fact",
  },
  {
    name: "Cek Fakta",
    url: (query) => `https://cekfakta.com/api-search?search=${encodeURIComponent(query)}`,
    accept: "text/html",
    parse: parseCekfakta,
    mode: "fact",
  },
  {
    name: "Kompas Cek Fakta",
    url: (query) => `https://search.kompas.com/search?q=${encodeURIComponent(`cek fakta ${query}`)}`,
    accept: "text/html",
    parse: parseKompasSearch,
    mode: "fact",
  },
  {
    name: "Antara Cek Fakta",
    url: (query) => `https://www.antaranews.com/search?q=${encodeURIComponent(`cek fakta ${query}`)}`,
    accept: "text/html",
    parse: parseAntara,
    mode: "fact",
  },
  {
    name: "Detik Cek Fakta",
    url: (query) => `https://www.detik.com/search/searchall?query=${encodeURIComponent(`cek fakta ${query}`)}`,
    accept: "text/html",
    parse: parseDetikSearch,
    mode: "fact",
  },
  {
    name: "Liputan6 Cek Fakta",
    url: () => "https://feed.liputan6.com/rss/cek-fakta",
    accept: "application/rss+xml, application/xml, text/xml",
    parse: parseLiputanRss,
    once: true,
    mode: "fact",
  },
  {
    name: "Komdigi",
    url: (query) => `https://www.komdigi.go.id/berita?search=${encodeURIComponent(query)}`,
    accept: "text/html",
    parse: parseKomdigi,
    mode: "fact",
  },
  // --- Berita penguat: entitas/judul, bukan seluruh teks, tanpa awalan "cek fakta" ---
  {
    name: "Google News",
    url: (query) => `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=id&gl=ID&ceid=ID:id`,
    accept: "application/rss+xml, application/xml, text/xml",
    parse: parseGoogleNewsRss,
    mode: "news",
  },
  {
    name: "Kompas Berita",
    url: (query) => `https://search.kompas.com/search?q=${encodeURIComponent(query)}`,
    accept: "text/html",
    parse: parseKompasNews,
    mode: "peer",
  },
  {
    name: "Detik Berita",
    url: (query) => `https://www.detik.com/search/searchall?query=${encodeURIComponent(query)}`,
    accept: "text/html",
    parse: parseDetikNews,
    mode: "peer",
  },
  {
    name: "Antara Berita",
    url: (query) => `https://www.antaranews.com/search?q=${encodeURIComponent(query)}`,
    accept: "text/html",
    parse: parseAntaraNews,
    mode: "peer",
  },
  {
    name: "Tempo",
    url: () => "https://www.tempo.co/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseTempoRss,
    once: true,
    mode: "peer",
  },
  {
    name: "Tirto",
    url: () => "https://tirto.id/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseTirtoRss,
    once: true,
    mode: "peer",
  },
  {
    name: "Kumparan",
    url: () => "https://lapi.kumparan.com/v2.0/rss/",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseKumparanRss,
    once: true,
    mode: "peer",
  },
  {
    name: "CNN Indonesia",
    url: () => "https://www.cnnindonesia.com/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseOutletRss("CNN Indonesia", "CNN Indonesia"),
    once: true,
    mode: "peer",
  },
  {
    name: "Republika",
    url: () => "https://www.republika.co.id/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseOutletRss("Republika", "Republika"),
    once: true,
    mode: "peer",
  },
  {
    name: "Media Indonesia",
    url: () => "https://mediaindonesia.com/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseOutletRss("Media Indonesia", "Media Indonesia"),
    once: true,
    mode: "peer",
  },
  {
    name: "Okezone",
    url: () => "https://sindikasi.okezone.com/index.php/rss/0/RSS2.0",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseOutletRss("Okezone", "Okezone"),
    once: true,
    mode: "peer",
  },
  {
    name: "Liputan6",
    url: () => "https://feed.liputan6.com/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseOutletRss("Liputan6", "Liputan6"),
    once: true,
    mode: "peer",
  },
  {
    name: "CNBC Indonesia",
    url: () => "https://www.cnbcindonesia.com/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseOutletRss("CNBC Indonesia", "CNBC Indonesia"),
    once: true,
    mode: "peer",
  },
  {
    name: "Suara",
    url: () => "https://www.suara.com/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseOutletRss("Suara", "Suara"),
    once: true,
    mode: "peer",
  },
  {
    name: "Viva",
    url: () => "https://www.viva.co.id/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseOutletRss("Viva", "Viva"),
    once: true,
    mode: "peer",
  },
  {
    name: "Merdeka",
    url: () => "https://www.merdeka.com/feed",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseOutletRss("Merdeka", "Merdeka"),
    once: true,
    mode: "peer",
  },
  {
    name: "JPNN",
    url: () => "https://www.jpnn.com/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseOutletRss("JPNN", "JPNN"),
    once: true,
    mode: "peer",
  },
  {
    name: "Sindonews",
    url: () => "https://www.sindonews.com/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseOutletRss("Sindonews", "Sindonews"),
    once: true,
    mode: "peer",
  },
  {
    name: "Tribun",
    url: () => "https://www.tribunnews.com/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseOutletRss("Tribun", "Tribun"),
    once: true,
    mode: "peer",
  },
  {
    name: "IDN Times",
    url: () => "https://www.idntimes.com/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseOutletRss("IDN Times", "IDN Times"),
    once: true,
    mode: "peer",
  },
  {
    name: "Katadata",
    url: () => "https://katadata.co.id/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseOutletRss("Katadata", "Katadata"),
    once: true,
    mode: "peer",
  },
  {
    name: "Bisnis",
    url: () => "https://www.bisnis.com/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseOutletRss("Bisnis", "Bisnis"),
    once: true,
    mode: "peer",
  },
  {
    name: "Kontan",
    url: () => "https://www.kontan.co.id/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseOutletRss("Kontan", "Kontan"),
    once: true,
    mode: "peer",
  },
];

async function searchOne(spec: SourceSpec, queries: string[]): Promise<{ facts: ExternalFact[]; probe: SourceProbe }> {
  if (spec.skip) return { facts: [], probe: { name: spec.name, state: "dilewati", detail: spec.skip } };
  if (queries.length === 0) return { facts: [], probe: { name: spec.name, state: "kosong", detail: "tanpa kueri" } };
  let blocked: string | null = null;
  let sawBody = false;
  const found: ExternalFact[] = [];
  const jobs = spec.once ? [queries[0]] : queries;
  const pages = await Promise.all(jobs.map(async (query) => {
    const loaded = await grab(spec.url(query), spec.accept);
    return { query, ...loaded };
  }));
  for (const page of pages) {
    if (page.blocked) {
      blocked = page.blocked;
      continue;
    }
    if (!page.body) continue;
    sawBody = true;
    if (spec.once) {
      for (const query of queries) found.push(...spec.parse(page.body, query));
    } else {
      found.push(...spec.parse(page.body, page.query));
    }
  }
  const facts = dedupeFacts(found);
  if (facts.length > 0) return { facts, probe: { name: spec.name, state: "hasil", detail: String(facts.length) } };
  if (blocked && !sawBody) {
    const missed = /HTTP 404/.test(blocked);
    if (missed) return { facts: [], probe: { name: spec.name, state: "kosong", detail: "pencarian tidak menemukan halaman" } };
    return { facts: [], probe: { name: spec.name, state: "ditolak", detail: blocked } };
  }
  return { facts: [], probe: { name: spec.name, state: "kosong" } };
}

function queriesFor(spec: SourceSpec, text: string, sourceUrl?: string | null): string[] {
  if (spec.mode === "news") return googleNewsQueries(text);
  if (spec.mode === "peer") return peerQueries(text).slice(0, 2);
  return urlFirstQueries(text, sourceUrl);
}

/**
 * Cek fakta saat analisis. Semua sumber dicoba bersamaan.
 * Google News memakai judul/entitas + jendela 7 hari; sumber cek fakta memakai URL lalu klaim.
 */
export async function searchLiveFactChecksDetailed(
  text: string,
  sourceUrl?: string | null,
): Promise<{ facts: ExternalFact[]; sources: SourceProbe[] }> {
  setPeerContentContext(text);
  const factQueries = urlFirstQueries(text, sourceUrl);
  const peer = peerQueries(text);
  const news = googleNewsQueries(text);
  if (
    factQueries.every((query) => query.trim().length < 3) &&
    peer.every((query) => query.trim().length < 3) &&
    news.every((query) => query.trim().length < 3)
  ) {
    return { facts: [], sources: [] };
  }
  const key = `${(sourceUrl ?? "").toLowerCase()}|${[...factQueries, ...peer, ...news].join("|").toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < LIVE_FACT_CACHE_MS) {
    return { facts: cached.facts, sources: cached.sources };
  }
  const rows = await Promise.all(
    SOURCES.map((spec) => searchOne(spec, queriesFor(spec, text, sourceUrl))),
  );
  const facts = dedupeFacts(rows.flatMap((row) => row.facts));
  const sources = rows.map((row) => row.probe);
  cache.set(key, { at: Date.now(), facts, sources });
  if (cache.size > 100) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return { facts, sources };
}

export async function searchLiveFactChecks(text: string, sourceUrl?: string | null): Promise<ExternalFact[]> {
  const found = await searchLiveFactChecksDetailed(text, sourceUrl);
  return found.facts;
}

export async function collectExternalFacts(text: string, sourceUrl?: string | null): Promise<{
  external: ExternalFact[];
  checkedAt: string;
  sources: SourceProbe[];
}> {
  const checkedAt = new Date().toISOString();
  const key = process.env.GOOGLE_FACTCHECK_API_KEY?.trim();
  const [live, google] = await Promise.all([
    searchLiveFactChecksDetailed(text, sourceUrl),
    key ? searchGoogleFactChecks(claimQueries(text).join(" ") || text.slice(0, 80)).catch(() => [] as ExternalFact[]) : Promise.resolve([] as ExternalFact[]),
  ]);
  const sources = [
    ...live.sources,
    key
      ? { name: "Google Fact Check Tools", state: google.length > 0 ? "hasil" as const : "kosong" as const, detail: google.length ? String(google.length) : undefined }
      : { name: "Google Fact Check Tools", state: "dilewati" as const, detail: "tanpa kunci, API berbayar" },
  ];
  return { external: dedupeFacts([...live.facts, ...google]), checkedAt, sources };
}
