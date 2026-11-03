/**
 * Sekali jalan: cari URL artikel TurnBackHoax untuk judul korpus Mafindo.
 *
 * turnbackhoax.id/wp-json/wp/v2/posts dan sitemap.xml menjawab 404
 * (situs sekarang Laravel, bukan WordPress). Pencarian publik yang hidup:
 * GET https://turnbackhoax.id/search?query= dengan Accept: application/json.
 * URL disimpan hanya bila judul hasil cocok dan GET artikel itu menjawab 200.
 *
 *   npm run facts:urls
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FactCheck } from "../src/lib/factcheck/types";
import {
  isMafindoSource,
  isTurnbackhoaxArticleUrl,
  mafindoBadge,
  titlesMatch,
  type TurnbackhoaxHit,
} from "../src/lib/factcheck/turnbackhoax";

const ROOT = process.cwd();
const FACTS = path.join(ROOT, "data/seed/fact-checks.json");
const OUT = path.join(ROOT, "data/seed/turnbackhoax-urls.json");

type SearchHit = { id?: string; slug?: string; title?: string };

function articleUrl(id: string, slug: string): string | null {
  if (!/^\d+$/.test(id)) return null;
  const clean = slug.trim().replace(/^-+/, "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(clean)) return null;
  const url = `https://turnbackhoax.id/articles/${id}-${clean}`;
  return isTurnbackhoaxArticleUrl(url) ? url : null;
}

async function search(title: string): Promise<SearchHit[]> {
  const endpoint = new URL("https://turnbackhoax.id/search");
  endpoint.searchParams.set("query", title.slice(0, 180));
  let last = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    const response = await fetch(endpoint, {
      headers: { accept: "application/json", "user-agent": "KartikaSentinel/0.1" },
      signal: AbortSignal.timeout(20000),
    });
    last = response.status;
    if (response.ok) {
      const payload = (await response.json()) as { data?: SearchHit[] };
      return Array.isArray(payload.data) ? payload.data : [];
    }
    if (response.status !== 429 && response.status < 500) break;
  }
  throw new Error(`pencarian HTTP ${last}`);
}

async function reachable(url: string): Promise<boolean> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "user-agent": "KartikaSentinel/0.1" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) return false;
  const finalHost = new URL(response.url).hostname;
  return finalHost === "turnbackhoax.id";
}

async function lookupOne(fact: FactCheck): Promise<TurnbackhoaxHit | null> {
  const rows = await search(fact.title);
  for (const row of rows) {
    const foundTitle = row.title?.trim() ?? "";
    const id = row.id?.trim() ?? "";
    const slug = row.slug?.trim() ?? "";
    if (!titlesMatch(fact.title, foundTitle)) continue;
    const url = articleUrl(id, slug);
    if (!url) continue;
    if (!(await reachable(url))) continue;
    return { title: fact.title, articleTitle: foundTitle, url };
  }
  return null;
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

async function main() {
  const facts = JSON.parse(readFileSync(FACTS, "utf8")) as FactCheck[];
  const targets = facts.filter((fact) => isMafindoSource(fact.source));
  let done = 0;
  const hits = await mapPool(targets, 2, async (fact) => {
    let hit: TurnbackhoaxHit | null = null;
    try {
      hit = await lookupOne(fact);
    } catch (error) {
      const message = error instanceof Error ? error.message : "gagal";
      console.error(`${fact.id}: ${message}`);
    }
    done += 1;
    if (done % 25 === 0) console.log(`${done}/${targets.length}`);
    return hit;
  });
  const matches = hits.filter((hit): hit is TurnbackhoaxHit => hit != null);
  const byTitle = new Map(matches.map((hit) => [hit.title, hit.url]));
  for (const fact of facts) {
    if (!isMafindoSource(fact.source)) continue;
    fact.summary = mafindoBadge(fact.verdict);
    const url = byTitle.get(fact.title);
    if (url) fact.url = url;
  }
  const report = {
    checkedAt: new Date().toISOString(),
    method: "GET https://turnbackhoax.id/search?query= Accept: application/json. WordPress /wp-json/wp/v2/posts dan sitemap.xml menjawab 404. URL disimpan hanya jika judul cocok dan artikel menjawab 200.",
    checked: targets.length,
    matched: matches.length,
    matches,
  };
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(FACTS, `${JSON.stringify(facts, null, 2)}\n`);
  console.log(JSON.stringify({ checked: targets.length, matched: matches.length }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
