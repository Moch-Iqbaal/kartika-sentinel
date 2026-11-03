/**
 * Tautan artikel TurnBackHoax hanya dari pencarian yang sudah disimpan.
 * Skrip scripts/lookup-turnbackhoax.ts mengisi data/seed/turnbackhoax-urls.json.
 * Tidak ada URL yang disusun dari judul saja.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { hasHttpUrl } from "./order";

export const MAFINDO_SOURCE = "umn-cyber/mafindo-2024";

export const MAFINDO_HOAX_BADGE = "Sumber: Mafindo (label hoaks dari Mafindo)";
export const MAFINDO_OTHER_BADGE = "Sumber: Mafindo (label bukan hoaks dari Mafindo)";

const LEADING_TAG =
  /^(?:\[[^\]]{1,40}\]|\((?:salah|hoax|hoaks|benar|klarifikasi|penipuan|editan|sesat|keliru|fitnah)\)|(?:salah|hoaks|hoax|benar|penipuan|editan|klarifikasi))\s*[:\-–—]?\s*/i;

export type TurnbackhoaxHit = {
  title: string;
  articleTitle: string;
  url: string;
};

export function isMafindoSource(source: string): boolean {
  return source === MAFINDO_SOURCE;
}

export function mafindoBadge(verdict: string): string {
  return verdict === "hoax" ? MAFINDO_HOAX_BADGE : MAFINDO_OTHER_BADGE;
}

export function normalizeFactTitle(value: string): string {
  let text = value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i += 1) {
    const next = text.replace(LEADING_TAG, "").trim();
    if (next === text) break;
    text = next;
  }
  return text
    .replace(/[“”„"']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cocok bila judul korpus dan judul artikel sama, atau yang pendek termuat utuh dan tidak jauh lebih pendek. */
export function titlesMatch(corpusTitle: string, articleTitle: string): boolean {
  const left = normalizeFactTitle(corpusTitle);
  const right = normalizeFactTitle(articleTitle);
  if (!left || !right) return false;
  if (left === right) return left.length >= 12;
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  if (shorter.length < 12) return false;
  return longer.includes(shorter) && shorter.length / longer.length >= 0.75;
}

export function turnbackhoaxSearchUrl(title: string): string {
  return `https://turnbackhoax.id/?s=${encodeURIComponent(title)}`;
}

export function isTurnbackhoaxArticleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "turnbackhoax.id" && url.pathname.startsWith("/articles/");
  } catch {
    return false;
  }
}

let cachedHits: TurnbackhoaxHit[] | undefined;

export function loadTurnbackhoaxHits(): TurnbackhoaxHit[] {
  if (cachedHits) return cachedHits;
  try {
    const parsed = JSON.parse(
      readFileSync(path.join(process.cwd(), "data/seed/turnbackhoax-urls.json"), "utf8"),
    ) as { matches?: TurnbackhoaxHit[] };
    cachedHits = (parsed.matches ?? []).filter((row) => lookupArticleUrl(row.title, [row]) === row.url);
  } catch {
    cachedHits = [];
  }
  return cachedHits;
}

export function articleUrlFor(source: string, title: string, url: string | null): string | null {
  if (url && hasHttpUrl(url)) return url;
  if (!isMafindoSource(source)) return url;
  return lookupArticleUrl(title, loadTurnbackhoaxHits());
}

export function lookupArticleUrl(title: string, rows: TurnbackhoaxHit[]): string | null {
  const key = normalizeFactTitle(title);
  const hit = rows.find((row) => normalizeFactTitle(row.title) === key && titlesMatch(row.title, row.articleTitle));
  if (!hit || !isTurnbackhoaxArticleUrl(hit.url)) return null;
  return hit.url;
}
