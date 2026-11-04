/**
 * Cadangan bila situs berita menolak unduhan langsung dari Vercel.
 * Semua jalur publik dan SSRF-aman lewat safeFetchText / assertPublicHttpUrl.
 */

import { parseGoogleNewsRss, parseTempoRss } from "../factcheck/live-parse";
import { classifyUrl } from "../model/register";
import { assertPublicHttpUrl, safeFetchText, UnsafeUrlError } from "../security/ssrf";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export const BROWSER_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7";

export const BROWSER_LANG = "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7";

export const SITE_BLOCKED_MESSAGE =
  "Situs ini menolak dibuka otomatis. Salin teks beritanya ke tab Teks.";

export type FetchVia = "langsung" | "onprem" | "jina" | "metadata";

export type FetchedDocument = {
  body: string;
  finalUrl: string;
  contentType: string;
  via: FetchVia;
};

const BLOCKED_STATUS = /\bHTTP (403|401|429|5\d\d)\b/i;

export function isBlockedFetchError(error: unknown): boolean {
  if (error instanceof UnsafeUrlError) {
    return (
      BLOCKED_STATUS.test(error.message) ||
      /Badan respons kosong|timeout|habis waktu/i.test(error.message)
    );
  }
  if (error instanceof Error) {
    const blob = `${error.name} ${error.message}`;
    return /AbortError|TimeoutError|timeout|aborted|network/i.test(blob);
  }
  return false;
}

export function userFacingBlockedError(error?: unknown): UnsafeUrlError {
  if (error instanceof UnsafeUrlError && !isBlockedFetchError(error)) return error;
  return new UnsafeUrlError(SITE_BLOCKED_MESSAGE);
}

/** Slug path → judul kasar. Contoh: kapolri-listyo-...-2303342 → "kapolri listyo … prabowo". */
export function titleFromArticleUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return "";
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "";
  let slug = parts[parts.length - 1] ?? "";
  slug = decodeURIComponent(slug)
    .replace(/\.(html?|php|aspx)$/i, "")
    .replace(/-\d{4,}$/g, "")
    .replace(/^\d{4,}-/g, "");
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchWithBrowserHeaders(input: string): Promise<FetchedDocument> {
  assertPublicHttpUrl(input);
  const response = await safeFetchText(input, {
    timeoutMs: 8000,
    userAgent: BROWSER_UA,
    accept: BROWSER_ACCEPT,
    acceptLanguage: BROWSER_LANG,
  });
  if (!response.body.trim()) throw new UnsafeUrlError("Badan respons kosong.");
  return {
    body: response.body,
    finalUrl: response.finalUrl,
    contentType: response.contentType,
    via: "langsung",
  };
}

async function onPremFetchEndpoint(): Promise<{ url: URL; token: string } | null> {
  try {
    const store = await import("../model/endpoint-store");
    const row = await store.readModelEndpoint();
    if (!row || !store.endpointIsFresh(row)) return null;
    const classify = classifyUrl(row.url);
    if (!classify) return null;
    const url = new URL(classify.href);
    url.pathname = "/fetch";
    url.search = "";
    url.hash = "";
    return { url, token: row.token };
  } catch {
    return null;
  }
}

/** Cadangan lewat Mac on-prem (tunnel yang sama dengan IndoBERT). */
export async function fetchViaOnPrem(input: string): Promise<FetchedDocument | null> {
  assertPublicHttpUrl(input);
  const endpoint = await onPremFetchEndpoint();
  if (!endpoint) return null;
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  if (endpoint.token) headers["x-kartika-model-token"] = endpoint.token;
  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: input }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      ok?: boolean;
      body?: string;
      finalUrl?: string;
      contentType?: string;
    };
    const body = typeof payload.body === "string" ? payload.body : "";
    if (!payload.ok || !body.trim()) return null;
    return {
      body,
      finalUrl: typeof payload.finalUrl === "string" && payload.finalUrl ? payload.finalUrl : input,
      contentType: typeof payload.contentType === "string" ? payload.contentType : "text/html",
      via: "onprem",
    };
  } catch {
    return null;
  }
}

/** Pembaca publik r.jina.ai — teks artikel tanpa JS situs asal. */
export async function fetchViaJina(input: string): Promise<FetchedDocument | null> {
  assertPublicHttpUrl(input);
  const reader = `https://r.jina.ai/${input}`;
  try {
    const response = await safeFetchText(reader, {
      timeoutMs: 12_000,
      userAgent: BROWSER_UA,
      accept: "text/plain,text/markdown,text/html;q=0.8",
      acceptLanguage: BROWSER_LANG,
    });
    const body = response.body.trim();
    if (body.length < 40) return null;
    return {
      body,
      finalUrl: input,
      contentType: response.contentType || "text/plain",
      via: "jina",
    };
  } catch (error) {
    if (isBlockedFetchError(error)) return null;
    return null;
  }
}

/**
 * Cadangan terakhir: judul dari slug + cuplikan Google News / RSS Tempo.
 * Cukup untuk analisis + pencarian bukti, meski tubuh artikel tidak lengkap.
 */
export async function fetchViaMetadata(input: string): Promise<FetchedDocument | null> {
  assertPublicHttpUrl(input);
  const title = titleFromArticleUrl(input);
  if (title.length < 8) return null;
  const lines: string[] = [title];
  const jobs = [
    safeFetchText(
      `https://news.google.com/rss/search?q=${encodeURIComponent(title)}&hl=id&gl=ID&ceid=ID:id`,
      {
        timeoutMs: 6000,
        userAgent: BROWSER_UA,
        accept: "application/rss+xml,application/xml,text/xml",
        acceptLanguage: BROWSER_LANG,
      },
    )
      .then((page) => parseGoogleNewsRss(page.body, title))
      .catch(() => []),
    safeFetchText("https://www.tempo.co/rss", {
      timeoutMs: 6000,
      userAgent: BROWSER_UA,
      accept: "application/rss+xml,application/xml,text/xml,text/html",
      acceptLanguage: BROWSER_LANG,
    })
      .then((page) => parseTempoRss(page.body, title))
      .catch(() => []),
  ];
  const [googleHits, tempoHits] = await Promise.all(jobs);
  for (const hit of [...googleHits, ...tempoHits].slice(0, 5)) {
    const snippet = hit.title.trim();
    if (snippet && !lines.includes(snippet)) lines.push(snippet);
  }
  const body = lines.join("\n\n");
  if (body.trim().length < 12) return null;
  return {
    body,
    finalUrl: input,
    contentType: "text/plain",
    via: "metadata",
  };
}

/** Rantai cadangan setelah unduhan langsung gagal. */
export async function fetchArticleWithFallbacks(input: string): Promise<FetchedDocument> {
  assertPublicHttpUrl(input);
  try {
    return await fetchWithBrowserHeaders(input);
  } catch (error) {
    if (!isBlockedFetchError(error)) throw userFacingBlockedError(error);
  }

  const onprem = await fetchViaOnPrem(input);
  if (onprem) return onprem;

  const jina = await fetchViaJina(input);
  if (jina) return jina;

  const meta = await fetchViaMetadata(input);
  if (meta) return meta;

  throw new UnsafeUrlError(SITE_BLOCKED_MESSAGE);
}
