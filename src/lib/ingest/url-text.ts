import { redactSensitive } from "@/lib/security/redact";
import { safeFetchText } from "@/lib/security/ssrf";
import { sanitizeUntrusted } from "@/lib/security/untrusted";

export type ExtractedPage = {
  text: string;
  finalUrl: string;
  authorHandle: string | null;
  title: string | null;
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

function htmlText(html: string): { title: string | null; description: string | null } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  const description =
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i)?.[1] ??
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
    null;
  const clean = (value: string | null) =>
    value
      ?.replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim() || null;
  return { title: clean(title), description: clean(description) };
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
    };
  }

  const response = await safeFetchText(input);
  if (response.contentType.includes("json")) {
    return {
      text: sanitizeUntrusted(redactSensitive(response.body.slice(0, 4000))),
      finalUrl: response.finalUrl,
      authorHandle: null,
      title: null,
    };
  }
  const extracted = htmlText(response.body);
  const text = sanitizeUntrusted(
    redactSensitive([extracted.title, extracted.description].filter(Boolean).join("\n")),
  );
  return { text, finalUrl: response.finalUrl, authorHandle: null, title: extracted.title };
}
