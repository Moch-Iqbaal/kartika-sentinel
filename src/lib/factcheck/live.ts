import { searchGoogleFactChecks } from "@/lib/factcheck/google";
import {
  dedupeFacts,
  cekfaktaQuery,
  factQuery,
  parseAntara,
  parseCekfakta,
  parseKomdigi,
  parseTurnbackhoax,
} from "@/lib/factcheck/live-parse";
import type { ExternalFact } from "@/lib/factcheck/types";
import { safeFetchText } from "@/lib/security/ssrf";

/** Pencarian langsung. Masing-masing sumber punya batas waktu pendek. */
export const LIVE_FACT_TIMEOUT_MS = 4000;
export const LIVE_FACT_CACHE_MS = 10 * 60 * 1000;

const USER_AGENT = "KartikaSentinel/0.1 (fact-check; +https://kartika-sentinel.vercel.app)";

type CacheEntry = { at: number; facts: ExternalFact[] };
const cache = new Map<string, CacheEntry>();

async function grab(url: string, accept: string): Promise<string | null> {
  try {
    const result = await safeFetchText(url, {
      accept,
      timeoutMs: LIVE_FACT_TIMEOUT_MS,
      userAgent: USER_AGENT,
    });
    return result.body;
  } catch {
    return null;
  }
}

/**
 * Cek fakta saat analisis, bukan dari korpus tersimpan saja.
 * TurnBackHoax, Cek Fakta, Antara, dan Komdigi dicoba bersamaan.
 * Sumber yang menolak atau kehabisan waktu diabaikan.
 */
export async function searchLiveFactChecks(text: string): Promise<ExternalFact[]> {
  const query = factQuery(text);
  if (query.trim().length < 3) return [];
  const key = query.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < LIVE_FACT_CACHE_MS) return cached.facts;
  const encoded = encodeURIComponent(query);
  const cekQuery = encodeURIComponent(cekfaktaQuery(text));
  const [turnback, cekfakta, antara, komdigi] = await Promise.all([
    grab(`https://turnbackhoax.id/search?query=${encoded}`, "application/json"),
    grab(`https://cekfakta.com/api-search?search=${cekQuery}`, "text/html"),
    grab(`https://www.antaranews.com/search?q=${encodeURIComponent(`cek fakta ${query}`)}`, "text/html"),
    grab(`https://www.komdigi.go.id/berita?search=${encoded}`, "text/html"),
  ]);
  const facts = dedupeFacts([
    ...(turnback ? parseTurnbackhoax(turnback, query) : []),
    ...(cekfakta ? parseCekfakta(cekfakta, query) : []),
    ...(antara ? parseAntara(antara, query) : []),
    ...(komdigi ? parseKomdigi(komdigi, query) : []),
  ]);
  cache.set(key, { at: Date.now(), facts });
  if (cache.size > 100) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return facts;
}

export async function collectExternalFacts(text: string): Promise<{ external: ExternalFact[]; checkedAt: string }> {
  const checkedAt = new Date().toISOString();
  const [live, google] = await Promise.all([
    searchLiveFactChecks(text),
    searchGoogleFactChecks(text).catch(() => [] as ExternalFact[]),
  ]);
  return { external: dedupeFacts([...live, ...google]), checkedAt };
}
