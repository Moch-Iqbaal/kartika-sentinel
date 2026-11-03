import { parseContentDate } from "@/lib/factcheck/dates";
import { extractArticle, scoredPageText } from "@/lib/ingest/article";
import {
  assembleYoutube,
  captionRequestUrl,
  chooseCaptionTrack,
  parseAttributedDescription,
  parseInnertubeClient,
  parsePlayerResponse,
  parseTimedText,
  parseTranscriptParams,
  transcriptFromInnertube,
  watchUrl,
  youtubeVideoId,
  type YoutubeCaptionTrack,
  type YoutubePart,
} from "@/lib/ingest/youtube";
import { redactSensitive } from "@/lib/security/redact";
import { safeFetchText, safePostJson, UnsafeUrlError } from "@/lib/security/ssrf";
import { sanitizeUntrusted } from "@/lib/security/untrusted";

export type ExtractedPage = {
  text: string;
  finalUrl: string;
  authorHandle: string | null;
  title: string | null;
  /**
   * Panjang tubuh artikel, tanpa judul.
   * Di bawah 200 karakter, pemanggil wajib menurunkan keyakinan skor.
   * Untuk YouTube ini panjang deskripsi ditambah transkrip.
   */
  bodyChars: number;
  youtube?: {
    parts: YoutubePart[];
    note: string;
  } | null;
  /** Tanggal terbit isi, YYYY-MM-DD. Kosong bila halaman tidak menyebutnya. */
  publishedAt?: string | null;
};

const YOUTUBE_BROWSER = "Mozilla/5.0 (compatible; KartikaSentinel/0.1; +https://kartika-sentinel.vercel.app)";

async function readCaption(tracks: YoutubeCaptionTrack[]): Promise<string | null> {
  const track = chooseCaptionTrack(tracks);
  const captionUrl = track ? captionRequestUrl(track.baseUrl) : null;
  if (!captionUrl) return null;
  try {
    const caption = await safeFetchText(captionUrl, {
      timeoutMs: 4000,
      accept: "application/json,application/xml,text/xml,text/plain",
      userAgent: YOUTUBE_BROWSER,
    });
    return parseTimedText(caption.body).trim() || null;
  } catch {
    return null;
  }
}

async function readInnertubeTranscript(html: string): Promise<string | null> {
  const params = parseTranscriptParams(html);
  const client = parseInnertubeClient(html);
  if (!params || !client) return null;
  const body = await safePostJson("https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false", {
    context: { client: { clientName: "WEB", clientVersion: client.clientVersion, hl: "id", gl: "ID" } },
    params,
  });
  if (!body) return null;
  try {
    return transcriptFromInnertube(JSON.parse(body)).trim() || null;
  } catch {
    return null;
  }
}

async function textFromYoutube(videoId: string): Promise<ExtractedPage> {
  const watch = watchUrl(videoId);
  const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`;
  const [oembedResult, pageResult] = await Promise.allSettled([
    safeFetchText(oembedUrl, { timeoutMs: 4000, accept: "application/json" }),
    safeFetchText(watch, { timeoutMs: 7000, userAgent: YOUTUBE_BROWSER, accept: "text/html" }),
  ]);
  let title: string | null = null;
  let channel: string | null = null;
  let description: string | null = null;
  let transcript: string | null = null;
  let publishedAt: string | null = null;
  if (oembedResult.status === "fulfilled") {
    try {
      const payload = JSON.parse(oembedResult.value.body) as { title?: string; author_name?: string };
      title = payload.title?.trim() || null;
      channel = payload.author_name?.trim() || null;
    } catch {
      title = null;
    }
  }
  if (pageResult.status === "fulfilled") {
    const player = parsePlayerResponse(pageResult.value.body);
    if (player) {
      title = player.title || title;
      channel = player.channel || channel;
      description = player.description;
      publishedAt = player.publishedAt;
      transcript = await readCaption(player.captions);
    }
    if (!description) description = parseAttributedDescription(pageResult.value.body);
    if (!transcript) transcript = await readInnertubeTranscript(pageResult.value.body);
  }
  if (!title && !description && !transcript) {
    const reason = pageResult.status === "rejected" && pageResult.reason instanceof UnsafeUrlError
      ? pageResult.reason.message
      : "Video YouTube tidak dapat dibaca.";
    throw new UnsafeUrlError(reason);
  }
  const assembled = assembleYoutube({ title, channel, description, transcript });
  const text = sanitizeUntrusted(redactSensitive(assembled.text));
  const pageHtml = pageResult.status === "fulfilled" ? pageResult.value.body : "";
  return {
    text,
    finalUrl: watch,
    authorHandle: channel,
    title,
    bodyChars: assembled.bodyChars,
    youtube: { parts: assembled.parts, note: assembled.note },
    publishedAt: publishedAt ?? parseContentDate(pageHtml),
  };
}

export async function textFromUrl(input: string): Promise<ExtractedPage> {
  const parsed = new URL(input);
  const videoId = youtubeVideoId(parsed);
  if (videoId) return textFromYoutube(videoId);

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
    publishedAt: parseContentDate(response.body),
  };
}
