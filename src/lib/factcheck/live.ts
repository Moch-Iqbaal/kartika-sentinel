import { searchGoogleFactChecks } from "@/lib/factcheck/google";
import {
  claimQueries,
  dedupeFacts,
  parseAntara,
  parseCekfakta,
  parseDetikSearch,
  parseGoogleNewsRss,
  parseKomdigi,
  parseKompasSearch,
  parseKumparanRss,
  parseLiputanRss,
  parseTempoRss,
  parseTirtoRss,
  parseTurnbackhoax,
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
};

const SOURCES: SourceSpec[] = [
  {
    name: "TurnBackHoax",
    url: (query) => `https://turnbackhoax.id/search?query=${encodeURIComponent(query)}`,
    accept: "application/json",
    parse: parseTurnbackhoax,
  },
  {
    name: "Cek Fakta",
    url: (query) => `https://cekfakta.com/api-search?search=${encodeURIComponent(query)}`,
    accept: "text/html",
    parse: parseCekfakta,
  },
  {
    name: "Kompas Cek Fakta",
    url: (query) => `https://search.kompas.com/search?q=${encodeURIComponent(`cek fakta ${query}`)}`,
    accept: "text/html",
    parse: parseKompasSearch,
  },
  {
    name: "Antara",
    url: (query) => `https://www.antaranews.com/search?q=${encodeURIComponent(`cek fakta ${query}`)}`,
    accept: "text/html",
    parse: parseAntara,
  },
  {
    name: "Detik",
    url: (query) => `https://www.detik.com/search/searchall?query=${encodeURIComponent(`cek fakta ${query}`)}`,
    accept: "text/html",
    parse: parseDetikSearch,
  },
  {
    name: "Liputan6 Cek Fakta",
    url: () => "https://feed.liputan6.com/rss/cek-fakta",
    accept: "application/rss+xml, application/xml, text/xml",
    parse: parseLiputanRss,
    once: true,
  },
  {
    name: "Tempo",
    url: () => "https://www.tempo.co/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseTempoRss,
    once: true,
  },
  {
    name: "Tirto",
    url: () => "https://tirto.id/rss",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseTirtoRss,
    once: true,
  },
  {
    name: "Kumparan",
    url: () => "https://lapi.kumparan.com/v2.0/rss/",
    accept: "application/rss+xml, application/xml, text/xml, text/html",
    parse: parseKumparanRss,
    once: true,
  },
  {
    name: "Komdigi",
    url: (query) => `https://www.komdigi.go.id/berita?search=${encodeURIComponent(query)}`,
    accept: "text/html",
    parse: parseKomdigi,
  },
  {
    name: "Google News",
    url: (query) => `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=id&gl=ID&ceid=ID:id`,
    accept: "application/rss+xml, application/xml, text/xml",
    parse: parseGoogleNewsRss,
  },
];

async function searchOne(spec: SourceSpec, queries: string[]): Promise<{ facts: ExternalFact[]; probe: SourceProbe }> {
  if (spec.skip) return { facts: [], probe: { name: spec.name, state: "dilewati", detail: spec.skip } };
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
    // Untuk sumber once (RSS), cocokkan setiap frasa klaim ke feed yang sama.
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

/**
 * Cek fakta saat analisis. Semua sumber dicoba bersamaan.
 * URL artikel dicari dulu, lalu judul, lalu frasa klaim.
 * Sumber yang menolak tidak menggagalkan yang lain.
 */
export async function searchLiveFactChecksDetailed(
  text: string,
  sourceUrl?: string | null,
): Promise<{ facts: ExternalFact[]; sources: SourceProbe[] }> {
  const queries = urlFirstQueries(text, sourceUrl);
  if (queries.length === 0 || queries.every((query) => query.trim().length < 3)) {
    return { facts: [], sources: [] };
  }
  const key = `${(sourceUrl ?? "").toLowerCase()}|${queries.join("|").toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < LIVE_FACT_CACHE_MS) {
    return { facts: cached.facts, sources: cached.sources };
  }
  const rows = await Promise.all(SOURCES.map((spec) => searchOne(spec, queries)));
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
