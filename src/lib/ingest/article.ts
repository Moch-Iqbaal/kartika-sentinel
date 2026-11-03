/**
 * Mengambil judul dan tubuh artikel dari HTML berita.
 *
 * Pemindai lama hanya membaca <title> dan meta description. Pada rilis resmi
 * TNI AD itu cukup untuk membuat model n-gram menjawab "hoaks" dengan keyakinan
 * tinggi, padahal tubuh beritanya tidak pernah ikut dinilai.
 *
 * Pemindai ini meniru Readability secara sempit, tanpa pustaka DOM:
 * 1. Abaikan script, style, nav, header, footer, aside, dan blok iklan.
 * 2. Utamakan <article> dengan paragraf terpanjang, lalu <main>, lalu seluruh halaman.
 * 3. Kumpulkan teks <p>. Bila tidak ada paragraf, jatuh ke teks yang masih terlihat.
 * Judul tetap diambil dari <title> (atau og:title) dan digabung dengan tubuh
 * oleh pemanggil. Meta description sengaja tidak dipakai sebagai isi artikel.
 */

const MIN_PARAGRAPH_CHARS = 40;

const RAW_SKIP = new Set(["script", "style", "noscript"]);

const DROP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "svg",
  "iframe",
  "canvas",
  "template",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "button",
  "figure",
  "figcaption",
  "menu",
  "ins",
]);

/** Token class/id yang hampir selalu menu, iklan, atau tombol berbagi, bukan tubuh berita. */
const NOISE_TOKENS = new Set([
  "ad",
  "ads",
  "advert",
  "advertisement",
  "iklan",
  "sponsor",
  "sponsored",
  "sidebar",
  "breadcrumb",
  "cookie",
  "popup",
  "newsletter",
  "related",
  "rekomendasi",
  "pagination",
  "comment",
  "comments",
  "komentar",
]);

/** Baris yang disisipkan portal (Detik, Liputan6) di antara paragraf. */
const NOISE_LINES = new Set([
  "advertisement",
  "iklan",
  "sponsored",
  "scroll to continue with content",
  "baca juga",
  "artikel disimpan",
  "anda menyukai artikel ini",
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
};

type Tag = {
  name: string;
  attrs: string;
  start: number;
  end: number;
  closing: boolean;
  selfClosing: boolean;
};

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr",
]);

function scanTag(html: string, from: number): Tag | null {
  if (html[from] !== "<") return null;
  if (html.startsWith("<!--", from)) {
    const close = html.indexOf("-->", from + 4);
    return { name: "!", attrs: "", start: from, end: close < 0 ? html.length : close + 3, closing: false, selfClosing: true };
  }
  if (html.startsWith("<!", from) || html.startsWith("<?", from)) {
    const close = html.indexOf(">", from + 2);
    return { name: "!", attrs: "", start: from, end: close < 0 ? html.length : close + 1, closing: false, selfClosing: true };
  }
  let cursor = from + 1;
  let closing = false;
  if (html[cursor] === "/") {
    closing = true;
    cursor += 1;
  }
  const nameStart = cursor;
  while (cursor < html.length && /[A-Za-z0-9]/.test(html[cursor])) cursor += 1;
  if (cursor === nameStart) return null;
  const name = html.slice(nameStart, cursor).toLowerCase();
  let quote: string | null = null;
  const attrStart = cursor;
  while (cursor < html.length) {
    const char = html[cursor];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      break;
    }
    cursor += 1;
  }
  const attrs = html.slice(attrStart, cursor);
  const end = cursor < html.length ? cursor + 1 : html.length;
  const selfClosing = VOID_TAGS.has(name) || /\/\s*$/.test(attrs);
  return { name, attrs, start: from, end, closing, selfClosing };
}

function afterRawElement(html: string, tag: Tag): number | null {
  if (tag.closing || !RAW_SKIP.has(tag.name)) return null;
  const rest = html.slice(tag.end);
  const match = new RegExp(`</${tag.name}\\s*>`, "i").exec(rest);
  return match ? tag.end + match.index + match[0].length : html.length;
}

function noiseTokens(attrs: string): boolean {
  const tokens = attrs.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((token) => NOISE_TOKENS.has(token));
}

function shouldSkip(tag: Tag): boolean {
  return DROP_TAGS.has(tag.name) || noiseTokens(tag.attrs);
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const point = code[1]?.toLowerCase() === "x"
        ? Number.parseInt(code.slice(2), 16)
        : Number.parseInt(code.slice(1), 10);
      if (!Number.isFinite(point) || point <= 0 || point > 0x10ffff) return entity;
      if (point < 32 && point !== 9 && point !== 10 && point !== 13) return " ";
      return String.fromCodePoint(point);
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

function visibleText(fragment: string): string {
  const stripped = fragment
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped).replace(/\s+/g, " ").trim();
}

function keepParagraph(text: string): boolean {
  if (text.length < MIN_PARAGRAPH_CHARS) return false;
  const key = text.toLowerCase().replace(/[.!…]+$/g, "").trim();
  return !NOISE_LINES.has(key);
}

function readParagraph(html: string, openEnd: number): { html: string; end: number } {
  const match = /<\/p\s*>|<p\b|<\/(?:div|article|section|main)\s*>/i.exec(html.slice(openEnd));
  if (!match) return { html: html.slice(openEnd), end: html.length };
  const at = openEnd + match.index;
  const closesParagraph = match[0].toLowerCase().startsWith("</p");
  return {
    html: html.slice(openEnd, at),
    end: closesParagraph ? at + match[0].length : at,
  };
}

/** Paragraf yang terlihat. Blok nav/iklan/script tidak ikut, termasuk <p> di dalamnya. */
export function collectParagraphs(html: string): string[] {
  const found: string[] = [];
  const skip: string[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf("<", cursor);
    if (start < 0) break;
    const tag = scanTag(html, start);
    if (!tag || tag.name === "!") {
      cursor = tag ? tag.end : start + 1;
      continue;
    }
    const rawEnd = afterRawElement(html, tag);
    if (rawEnd != null) {
      cursor = rawEnd;
      continue;
    }
    if (tag.closing) {
      const at = skip.lastIndexOf(tag.name);
      if (at >= 0) skip.splice(at);
      cursor = tag.end;
      continue;
    }
    if (tag.selfClosing) {
      cursor = tag.end;
      continue;
    }
    if (skip.length > 0 || shouldSkip(tag)) {
      skip.push(tag.name);
      cursor = tag.end;
      continue;
    }
    if (tag.name === "p") {
      const paragraph = readParagraph(html, tag.end);
      const text = visibleText(paragraph.html);
      if (keepParagraph(text)) found.push(text);
      cursor = paragraph.end;
      continue;
    }
    cursor = tag.end;
  }
  return found;
}

function elementInners(html: string, name: string): string[] {
  const regions: string[] = [];
  const stack: number[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf("<", cursor);
    if (start < 0) break;
    const tag = scanTag(html, start);
    if (!tag || tag.name === "!") {
      cursor = tag ? tag.end : start + 1;
      continue;
    }
    const rawEnd = afterRawElement(html, tag);
    if (rawEnd != null) {
      cursor = rawEnd;
      continue;
    }
    if (tag.name === name && !tag.selfClosing) {
      if (tag.closing) {
        const innerStart = stack.pop();
        if (innerStart != null && stack.length === 0) regions.push(html.slice(innerStart, tag.start));
      } else {
        stack.push(tag.end);
      }
    }
    cursor = tag.end;
  }
  return regions;
}

function visibleRegion(html: string): string {
  const parts: string[] = [];
  const skip: string[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf("<", cursor);
    if (start < 0) {
      if (skip.length === 0) parts.push(html.slice(cursor));
      break;
    }
    if (skip.length === 0 && start > cursor) parts.push(html.slice(cursor, start));
    const tag = scanTag(html, start);
    if (!tag || tag.name === "!") {
      cursor = tag ? tag.end : start + 1;
      continue;
    }
    const rawEnd = afterRawElement(html, tag);
    if (rawEnd != null) {
      cursor = rawEnd;
      continue;
    }
    if (tag.closing) {
      const at = skip.lastIndexOf(tag.name);
      if (at >= 0) skip.splice(at);
      cursor = tag.end;
      continue;
    }
    if (!tag.selfClosing && (skip.length > 0 || shouldSkip(tag))) skip.push(tag.name);
    cursor = tag.end;
  }
  return visibleText(parts.join(" "));
}

function regionBody(region: string): string {
  const paragraphs = collectParagraphs(region);
  if (paragraphs.length > 0) return paragraphs.join("\n\n");
  return visibleRegion(region);
}

function longest(parts: string[]): string {
  return parts.reduce((best, part) => (part.length > best.length ? part : best), "");
}

function readTitle(html: string): string | null {
  const tagged = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = visibleText(tagged ?? "");
  if (title) return title;
  const og =
    html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i)?.[1] ??
    html.match(/<meta\b[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["']/i)?.[1];
  return visibleText(og ?? "") || null;
}

export type ArticleExtract = {
  title: string | null;
  /** Tubuh artikel saja, tanpa judul dan tanpa meta description. */
  body: string;
};

/**
 * Pilih wilayah yang paling mirip artikel.
 * Beberapa <article> (kartu "berita lain") sering kosong atau pendek.
 * Yang dipakai adalah yang paragrafnya paling panjang.
 */
export function extractArticle(html: string): ArticleExtract {
  const title = readTitle(html);
  const articles = elementInners(html, "article");
  const fromArticles = longest(articles.map(regionBody));
  if (fromArticles.length >= 200) return { title, body: fromArticles };
  const mains = elementInners(html, "main");
  const fromMain = longest(mains.map(regionBody));
  if (fromMain.length >= 200) return { title, body: fromMain };
  // Ada wadah artikel, tetapi isinya pendek. Jangan jatuh ke seluruh halaman:
  // menu dan judul akan terlihat seperti tubuh dan menyembunyikan peringatan.
  if (articles.length > 0 || mains.length > 0) {
    return { title, body: longest([fromArticles, fromMain]) };
  }
  return { title, body: regionBody(html) };
}

/**
 * Teks yang masuk ke pemeringkat: judul, lalu tubuh.
 * Deskripsi meta tidak ikut. Jika tubuh hanya mengulang judul, judul tidak digandakan.
 */
export function scoredPageText(title: string | null, body: string): string {
  const head = title?.trim() ?? "";
  const text = body.trim();
  if (!text || text === head) return head || text;
  if (!head) return text;
  return `${head}\n\n${text}`;
}
