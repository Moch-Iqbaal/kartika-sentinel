import { extractArticle, scoredPageText } from "@/lib/ingest/article";
import { redactSensitive } from "@/lib/security/redact";
import { safeFetchText } from "@/lib/security/ssrf";
import { sanitizeUntrusted } from "@/lib/security/untrusted";

export type ExtractedPage = {
  text: string;
  finalUrl: string;
  authorHandle: string | null;
  title: string | null;
  /**
   * Panjang tubuh artikel, tanpa judul.
   * Di bawah 200 karakter, pemanggil wajib menurunkan keyakinan skor.
   * Untuk YouTube dan JSON tidak ada tubuh terpisah, jadi panjang teks yang dinilai dipakai.
   */
  bodyChars: number;
};

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || null;
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "shorts" || parts[0] === "embed") return parts[1] || null;
  }
  return null;
}

export async function textFromUrl(input: string): Promise<ExtractedPage> {
  const parsed = new URL(input);
  const videoId = youtubeId(parsed);
  if (videoId) {
    const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const oembed = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`;
    const response = await safeFetchText(oembed);
    const payload = JSON.parse(response.body) as {
      title?: string;
      author_name?: string;
      provider_name?: string;
    };
    const title = payload.title?.trim() || null;
    const text = sanitizeUntrusted(
      redactSensitive([title, payload.provider_name ? `Penyedia: ${payload.provider_name}` : ""]
        .filter(Boolean)
        .join("\n")),
    );
    return {
      text,
      finalUrl: watch,
      authorHandle: payload.author_name?.trim() || null,
      title,
      bodyChars: text.length,
    };
  }

  const response = await safeFetchText(input);
  if (response.contentType.includes("json")) {
    const text = sanitizeUntrusted(redactSensitive(response.body.slice(0, 4000)));
    return {
      text,
      finalUrl: response.finalUrl,
      authorHandle: null,
      title: null,
      bodyChars: text.length,
    };
  }
  const extracted = extractArticle(response.body);
  const text = sanitizeUntrusted(redactSensitive(scoredPageText(extracted.title, extracted.body)));
  return {
    text,
    finalUrl: response.finalUrl,
    authorHandle: null,
    title: extracted.title,
    bodyChars: extracted.body.length,
  };
}
