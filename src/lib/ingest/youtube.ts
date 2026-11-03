/**
 * Bacaan YouTube tanpa kunci API.
 * Judul dan kanal dari oEmbed atau videoDetails.
 * Deskripsi dari videoDetails.shortDescription di halaman tonton.
 * Transkrip dari captionTracks, bila ada.
 */

export type YoutubePart = "judul" | "deskripsi" | "transkrip";

export type YoutubeCaptionTrack = {
  baseUrl: string;
  languageCode: string;
  kind?: string;
};

export type YoutubeDetails = {
  title: string | null;
  channel: string | null;
  description: string | null;
  captions: YoutubeCaptionTrack[];
};

export type YoutubeAssembly = {
  text: string;
  parts: YoutubePart[];
  note: string;
  /** Panjang deskripsi + transkrip, tanpa judul. */
  bodyChars: number;
};

export const YOUTUBE_ONLY_TITLE_NOTE = "Hanya judul yang terbaca. Ucapan di video tidak ada.";

const DESCRIPTION_CAP = 2_500;
const TRANSCRIPT_CAP = 8_000;

export function youtubeVideoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] || "";
    return id.length >= 6 ? id : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") return parts[1] || null;
  }
  return null;
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/** Objek JSON yang mengikuti penanda, dengan hitungan kurung yang sadar string. */
export function extractJsonAfter(source: string, marker: string): unknown | null {
  const at = source.indexOf(marker);
  if (at < 0) return null;
  let index = at + marker.length;
  while (index < source.length && source[index] !== "{") index += 1;
  if (source[index] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  const start = index;
  for (; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function textField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parsePlayerResponse(html: string): YoutubeDetails | null {
  let from = 0;
  let parsed: Record<string, unknown> | null = null;
  while (from < html.length) {
    const at = html.indexOf("ytInitialPlayerResponse", from);
    if (at < 0) break;
    const candidate = asRecord(extractJsonAfter(html.slice(at), "ytInitialPlayerResponse"));
    if (asRecord(candidate?.videoDetails)) {
      parsed = candidate;
      break;
    }
    from = at + "ytInitialPlayerResponse".length;
  }
  const details = asRecord(parsed?.videoDetails);
  if (!details) return null;
  const captions = asRecord(parsed?.captions);
  const renderer = asRecord(captions?.playerCaptionsTracklistRenderer);
  const tracks = Array.isArray(renderer?.captionTracks) ? renderer.captionTracks : [];
  const captionTracks: YoutubeCaptionTrack[] = [];
  for (const track of tracks) {
    const row = asRecord(track);
    const baseUrl = textField(row?.baseUrl);
    const languageCode = textField(row?.languageCode);
    if (!baseUrl || !languageCode) continue;
    const kind = textField(row?.kind) ?? undefined;
    captionTracks.push({ baseUrl, languageCode, kind });
  }
  return {
    title: textField(details.title),
    channel: textField(details.author),
    description: textField(details.shortDescription),
    captions: captionTracks,
  };
}

/** Deskripsi di halaman tonton bila videoDetails disembunyikan. */
export function parseAttributedDescription(html: string): string | null {
  const parsed = asRecord(extractJsonAfter(html, "attributedDescription"));
  return textField(parsed?.content);
}

export function parseTranscriptParams(html: string): string | null {
  const match = html.match(/"getTranscriptEndpoint":\{"params":"([^"]+)"/);
  return match?.[1] ?? null;
}

export function parseInnertubeClient(html: string): { apiKey: string; clientVersion: string } | null {
  const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];
  if (!apiKey || !clientVersion) return null;
  return { apiKey, clientVersion };
}

/** Teks dari respons get_transcript, kalau endpoint itu yang tersedia. */
export function transcriptFromInnertube(payload: unknown): string {
  const lines: string[] = [];
  walkTranscript(payload, lines);
  return lines.join(" ").replace(/\s+/g, " ").trim().slice(0, TRANSCRIPT_CAP);
}

function walkTranscript(value: unknown, lines: string[]): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walkTranscript(item, lines);
    return;
  }
  const record = value as Record<string, unknown>;
  const segment = asRecord(record.transcriptSegmentRenderer);
  if (segment) {
    const runs = asRecord(segment.snippet)?.runs;
    if (Array.isArray(runs)) {
      const line = runs.map((run) => textField(asRecord(run)?.text) ?? "").join("").trim();
      if (line) lines.push(line);
    }
    return;
  }
  for (const child of Object.values(record)) walkTranscript(child, lines);
}

function isManual(track: YoutubeCaptionTrack): boolean {
  return track.kind !== "asr";
}

function language(track: YoutubeCaptionTrack, code: string): boolean {
  return track.languageCode === code || track.languageCode.startsWith(`${code}-`);
}

/** Indonesia manual, lalu Indonesia otomatis, lalu Inggris. */
export function chooseCaptionTrack(tracks: YoutubeCaptionTrack[]): YoutubeCaptionTrack | null {
  const order = [
    (track: YoutubeCaptionTrack) => language(track, "id") && isManual(track),
    (track: YoutubeCaptionTrack) => language(track, "id") && !isManual(track),
    (track: YoutubeCaptionTrack) => language(track, "en") && isManual(track),
    (track: YoutubeCaptionTrack) => language(track, "en") && !isManual(track),
  ];
  for (const match of order) {
    const found = tracks.find(match);
    if (found) return found;
  }
  return null;
}

export function captionRequestUrl(baseUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "youtube.com" && !host.endsWith(".youtube.com")) return null;
  if (url.protocol !== "https:") return null;
  if (!url.searchParams.get("fmt")) url.searchParams.set("fmt", "json3");
  return url.toString();
}

function decodeXml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function json3Text(body: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const events = asRecord(parsed)?.events;
  if (!Array.isArray(events)) return null;
  const lines: string[] = [];
  for (const event of events) {
    const segs = asRecord(event)?.segs;
    if (!Array.isArray(segs)) continue;
    const line = segs
      .map((seg) => textField(asRecord(seg)?.utf8) ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) continue;
    const previous = lines[lines.length - 1];
    if (previous && (line.startsWith(previous) || previous.startsWith(line))) {
      if (line.length > previous.length) lines[lines.length - 1] = line;
      continue;
    }
    lines.push(line);
  }
  return lines.join(" ");
}

function xmlText(body: string): string {
  const lines: string[] = [];
  for (const match of body.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)) {
    const line = decodeXml(match[1] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (line) lines.push(line);
  }
  return lines.join(" ");
}

export function parseTimedText(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return (json3Text(trimmed) ?? "").slice(0, TRANSCRIPT_CAP);
  }
  return xmlText(trimmed).slice(0, TRANSCRIPT_CAP);
}

export function assembleYoutube(input: {
  title: string | null;
  channel: string | null;
  description: string | null;
  transcript: string | null;
}): YoutubeAssembly {
  const parts: YoutubePart[] = [];
  const blocks: string[] = [];
  const title = input.title?.trim() || "";
  const channel = input.channel?.trim() || "";
  const description = input.description?.replace(/\s+/g, " ").trim().slice(0, DESCRIPTION_CAP) || "";
  const transcript = input.transcript?.replace(/\s+/g, " ").trim().slice(0, TRANSCRIPT_CAP) || "";
  if (title) {
    parts.push("judul");
    blocks.push(title);
  }
  if (channel) blocks.push(`Kanal: ${channel}`);
  if (description) {
    parts.push("deskripsi");
    blocks.push(description);
  }
  if (transcript) {
    parts.push("transkrip");
    blocks.push(transcript);
  }
  const hasDescription = parts.includes("deskripsi");
  const hasTranscript = parts.includes("transkrip");
  let note = YOUTUBE_ONLY_TITLE_NOTE;
  if (hasDescription && hasTranscript) note = "Yang terbaca: judul, keterangan, dan ucapan.";
  else if (hasTranscript) note = "Yang terbaca: judul dan ucapan.";
  else if (hasDescription) note = "Yang terbaca: judul dan keterangan. Ucapan di video tidak ada.";
  return {
    text: blocks.join("\n\n"),
    parts,
    note,
    bodyChars: description.length + transcript.length,
  };
}
