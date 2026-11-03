import "server-only";
import fs from "node:fs";
import path from "node:path";
import { scoreContentSync, type ScoreCard } from "@/lib/analyze/score";
import type { Session } from "@/lib/auth/token";
import { embedText } from "@/lib/embed/hashing";
import type { ExternalFact, FactCheck } from "@/lib/factcheck/types";
import { recommendation } from "@/lib/format";
import { AUDIT_LIST_LIMIT, DEMO_RETENTION_DAYS } from "@/lib/limits";
import { hashHandle } from "@/lib/security/redact";
import { riskBand, viralityFromMetrics, type MetricPoint } from "@/lib/scoring/risk";
import { parseCsv } from "@/lib/text/csv";
import type { AlertListItem, AlertStatus, AuditEntry, CaseDetail, CaseStatus } from "@/lib/db/types";
import { stableUuid } from "@/lib/db/ids";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

type DbError = { message: string } | null;

function unwrap<T>(result: { data: T; error: DbError }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function first(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

async function assignee(session: Session | null): Promise<string | null> {
  if (!session) return null;
  const { data } = await supabaseAdmin().from("analysts").select("id").eq("id", session.sub).maybeSingle();
  return data?.id ?? null;
}

function canMutate(session: Session, assignedTo: string | null): boolean {
  if (session.role === "admin") return true;
  if (!assignedTo) return true;
  return assignedTo === session.sub;
}

export async function ensureReady(): Promise<void> {
  const db = supabaseAdmin();
  const { count, error } = await db.from("fact_checks").select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) return;
  const corpus = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/seed/fact-checks.json"), "utf8")) as FactCheck[];
  const now = new Date().toISOString();
  for (let index = 0; index < corpus.length; index += 80) {
    const chunk = corpus.slice(index, index + 80).map((fact) => ({
      id: stableUuid(fact.id),
      source: fact.source,
      title: fact.title,
      claim: fact.claim,
      verdict: fact.verdict,
      url: fact.url,
      published_at: fact.publishedAt,
      summary: fact.summary,
      license: fact.license,
      embedding: `[${embedText(`${fact.title}\n${fact.claim}`).join(",")}]`,
      created_at: now,
    }));
    unwrap(await db.from("fact_checks").upsert(chunk));
  }
  const posts = parseCsv(fs.readFileSync(path.join(process.cwd(), "data/seed/demo-posts.csv"), "utf8"));
  const metrics = parseCsv(fs.readFileSync(path.join(process.cwd(), "data/seed/demo-metrics.csv"), "utf8"));
  const byId = new Map<string, MetricPoint[]>();
  for (const row of metrics) {
    const list = byId.get(row.external_id) ?? [];
    list.push({
      observedAt: row.observed_at,
      likes: Number(row.likes) || 0,
      shares: Number(row.shares) || 0,
      comments: Number(row.comments) || 0,
    });
    byId.set(row.external_id, list);
  }
  const loaded = await corpusFromDb();
  for (const post of posts) {
    const points = byId.get(post.external_id) ?? [];
    const card = scoreContentSync(post.content, viralityFromMetrics(points), loaded);
    await saveScoredAlert({
      platform: post.platform || "demo-csv",
      externalId: post.external_id,
      url: null,
      authorHandle: post.author_handle,
      postedAt: post.posted_at,
      demo: true,
      card,
      metrics: points,
      external: [],
      actor: null,
    });
  }
}

function mapAlert(row: Record<string, unknown>): AlertListItem {
  const analysis = first(row.analyses);
  const post = first(analysis.posts);
  const riskScore = Number(row.risk_score ?? 0);
  const tags = analysis.topic_tags;
  return {
    id: String(row.id),
    riskScore,
    band: riskBand(riskScore),
    status: String(row.status) as AlertStatus,
    virality: Number(row.virality ?? 0),
    hoaxScore: Number(analysis.hoax_score ?? 0),
    topicTags: Array.isArray(tags) ? tags.map(String) : [],
    aiFlag: Boolean(analysis.ai_flag),
    modelVersion: String(analysis.model_version ?? ""),
    excerpt: String(analysis.input_text ?? "").slice(0, 180),
    platform: String(post.platform ?? ""),
    authorHash: post.author_handle_hash ? String(post.author_handle_hash) : null,
    postedAt: post.posted_at ? String(post.posted_at) : null,
    demo: Boolean(post.demo),
  };
}

const LIST_SELECT = `
  id, risk_score, status, virality, assigned_to, case_id,
  analyses!inner (
    hoax_score, topic_tags, ai_flag, model_version, input_text, rationale, id,
    posts (platform, author_handle_hash, posted_at, demo, url, id)
  )
`;

export async function listAlerts(): Promise<AlertListItem[]> {
  await ensureReady();
  const rows = unwrap(await supabaseAdmin().from("alerts").select(LIST_SELECT).order("risk_score", { ascending: false }));
  return (rows as Record<string, unknown>[]).map(mapAlert);
}

export async function velocitySeries() {
  const alerts = (await listAlerts()).slice(0, 4);
  const series = [];
  for (const alert of alerts) {
    const detail = await getCase(alert.id);
    series.push({ id: alert.id, label: alert.topicTags[0] ?? alert.id.slice(0, 8), points: detail?.metrics ?? [] });
  }
  return series;
}

export async function topicCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const alert of await listAlerts()) {
    for (const tag of alert.topicTags) counts[tag] = (counts[tag] ?? 0) + 1;
  }
  return counts;
}

export async function corpusFromDb(): Promise<FactCheck[]> {
  await ensureReady();
  const rows = unwrap(await supabaseAdmin().from("fact_checks").select("id, source, title, claim, verdict, url, published_at, summary, license"));
  return (rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    source: String(row.source),
    title: String(row.title),
    claim: String(row.claim),
    verdict: String(row.verdict) as FactCheck["verdict"],
    url: row.url ? String(row.url) : null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    summary: String(row.summary ?? ""),
    license: String(row.license ?? ""),
  }));
}

export async function getCase(alertId: string): Promise<CaseDetail | null> {
  const row = unwrap(
    await supabaseAdmin().from("alerts").select(`
      id, risk_score, status, virality, assigned_to, case_id, created_at,
      analyses!inner (
        id, input_text, hoax_score, model_version, rationale,
        posts (platform, author_handle_hash, url, demo, posted_at, id),
        matches (similarity, fact_checks (id, source, title, claim, verdict, url, published_at, summary, license))
      ),
      cases (id, title, status, analyst_note)
    `).eq("id", alertId).maybeSingle(),
  );
  if (!row) return null;
  const record = row as Record<string, unknown>;
  const analysis = first(record.analyses);
  const post = first(analysis.posts);
  const caseRow = first(record.cases);
  const rationale = asRecord(analysis.rationale);
  const assessment = asRecord(rationale.assessment);
  const riskScore = Number(record.risk_score ?? 0);
  const band = riskBand(riskScore);
  const matchRows = Array.isArray(analysis.matches) ? analysis.matches : [];
  const metricsRows = unwrap(
    await supabaseAdmin().from("post_metrics").select("observed_at, likes, shares, comments").eq("post_id", String(post.id ?? "")).order("observed_at"),
  ) as Record<string, unknown>[];
  const metrics = metricsRows.map((metric) => ({
    observedAt: String(metric.observed_at),
    likes: Number(metric.likes ?? 0),
    shares: Number(metric.shares ?? 0),
    comments: Number(metric.comments ?? 0),
  }));
  const ai = asRecord(assessment.ai);
  return {
    alertId: String(record.id),
    riskScore,
    band,
    alertStatus: String(record.status) as AlertStatus,
    virality: Number(record.virality ?? 0),
    hoaxScore: Number(analysis.hoax_score ?? 0),
    sensitivity: Number(rationale.sensitivity ?? 0),
    modelVersion: String(analysis.model_version ?? ""),
    engine: String(assessment.engine ?? "heuristic"),
    text: String(analysis.input_text ?? ""),
    topics: Array.isArray(rationale.topics) ? rationale.topics as CaseDetail["topics"] : [],
    ai: {
      flagged: Boolean(ai.flagged),
      score: Number(ai.score ?? 0),
      confidence: (ai.confidence as CaseDetail["ai"]["confidence"]) || "rendah",
      reasons: Array.isArray(ai.reasons) ? ai.reasons.map(String) : [],
      signals: Array.isArray(ai.signals) ? ai.signals as CaseDetail["ai"]["signals"] : [],
      disclaimer: String(ai.disclaimer ?? ""),
    },
    assessment: rationale.assessment as CaseDetail["assessment"],
    matches: matchRows.map((match) => {
      const item = asRecord(match);
      const fact = first(item.fact_checks);
      return {
        id: String(fact.id ?? ""),
        source: String(fact.source ?? ""),
        title: String(fact.title ?? ""),
        claim: String(fact.claim ?? ""),
        verdict: String(fact.verdict ?? "unverified") as FactCheck["verdict"],
        url: fact.url ? String(fact.url) : null,
        publishedAt: fact.published_at ? String(fact.published_at) : null,
        summary: String(fact.summary ?? ""),
        license: String(fact.license ?? ""),
        similarity: Number(item.similarity ?? 0),
      };
    }),
    external: Array.isArray(rationale.external) ? rationale.external as ExternalFact[] : [],
    metrics,
    platform: String(post.platform ?? ""),
    authorHash: post.author_handle_hash ? String(post.author_handle_hash) : null,
    sourceUrl: post.url ? String(post.url) : null,
    demo: Boolean(post.demo),
    postedAt: post.posted_at ? String(post.posted_at) : null,
    caseId: caseRow.id ? String(caseRow.id) : null,
    caseTitle: caseRow.title ? String(caseRow.title) : null,
    caseStatus: caseRow.status ? String(caseRow.status) as CaseStatus : null,
    assignedTo: record.assigned_to ? String(record.assigned_to) : null,
    recommendation: String(rationale.recommendation ?? recommendation(band)),
    analystNote: caseRow.analyst_note ? String(caseRow.analyst_note) : null,
    modelStatus: (assessment.modelStatus as CaseDetail["modelStatus"]) || "dilewati",
    timeline: [
      ...(post.posted_at ? [{ at: String(post.posted_at), label: "Terbit", detail: "Waktu pada umpan atau masukan." }] : []),
      ...metrics.map((point) => ({ at: point.observedAt, label: "Sebaran", detail: `${point.shares} sebar` })),
    ],
  };
}

export async function saveScoredAlert(input: {
  platform: string;
  externalId: string;
  url: string | null;
  authorHandle: string | null;
  postedAt: string | null;
  demo: boolean;
  card: ScoreCard;
  metrics: MetricPoint[];
  external: ExternalFact[];
  actor: string | null;
}): Promise<string> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const postId = crypto.randomUUID();
  const analysisId = crypto.randomUUID();
  const alertId = crypto.randomUUID();
  const assigned = input.actor ? await assignee({ sub: input.actor, email: "", role: "analyst", exp: 0 }) : null;
  unwrap(await db.from("posts").insert({
    id: postId,
    platform: input.platform,
    external_id: input.externalId,
    url: input.url,
    author_handle_hash: hashHandle(input.authorHandle),
    content: input.card.clean,
    posted_at: input.postedAt,
    demo: input.demo,
    created_at: now,
  }));
  if (input.metrics.length > 0) {
    unwrap(await db.from("post_metrics").insert(input.metrics.map((point) => ({
      post_id: postId,
      observed_at: point.observedAt,
      likes: point.likes,
      shares: point.shares,
      comments: point.comments,
    }))));
  }
  unwrap(await db.from("analyses").insert({
    id: analysisId,
    post_id: postId,
    input_text: input.card.clean,
    hoax_score: input.card.assessment.probability,
    topic_tags: input.card.topics.map((topic) => topic.id),
    ai_flag: input.card.assessment.ai.flagged,
    ai_score: input.card.assessment.ai.score,
    model_version: input.card.assessment.modelVersion,
    embedding: `[${input.card.embedding.join(",")}]`,
    rationale: {
      engine: input.card.assessment.engine,
      sensitivity: input.card.sensitivity,
      topics: input.card.topics,
      assessment: input.card.assessment,
      external: input.external,
      recommendation: recommendation(input.card.band),
    },
    created_at: now,
  }));
  if (input.card.matches.length > 0) {
    unwrap(await db.from("matches").insert(input.card.matches.map((match) => ({
      id: crypto.randomUUID(),
      analysis_id: analysisId,
      fact_check_id: match.id,
      similarity: match.similarity,
    }))));
  }
  unwrap(await db.from("alerts").insert({
    id: alertId,
    analysis_id: analysisId,
    risk_score: input.card.risk,
    status: "new",
    assigned_to: assigned,
    virality: input.card.virality,
    created_at: now,
    updated_at: now,
  }));
  unwrap(await db.from("audit_log").insert({
    table_name: "alerts",
    row_id: alertId,
    action: "INSERT",
    actor: assigned,
    diff: { status: "new", risk: input.card.risk },
  }));
  return alertId;
}

export async function updateAlertStatus(session: Session, alertId: string, status: AlertStatus): Promise<void> {
  const detail = await getCase(alertId);
  if (!detail) throw new Error("Peringatan tidak ditemukan.");
  if (!canMutate(session, detail.assignedTo)) throw new Error("Analis hanya dapat mengubah peringatan yang ditugaskan kepadanya.");
  const assigned = detail.assignedTo ?? await assignee(session);
  unwrap(await supabaseAdmin().from("alerts").update({
    status,
    assigned_to: assigned,
    updated_at: new Date().toISOString(),
  }).eq("id", alertId));
  unwrap(await supabaseAdmin().from("audit_log").insert({
    table_name: "alerts",
    row_id: alertId,
    action: "UPDATE",
    actor: assigned,
    diff: { old: { status: detail.alertStatus }, new: { status } },
  }));
}

export async function openCase(session: Session, alertId: string): Promise<string> {
  const detail = await getCase(alertId);
  if (!detail) throw new Error("Peringatan tidak ditemukan.");
  if (!canMutate(session, detail.assignedTo)) throw new Error("Analis hanya dapat membuka berkas yang ditugaskan kepadanya.");
  if (detail.caseId) return detail.caseId;
  const caseId = crypto.randomUUID();
  const assigned = await assignee(session);
  const now = new Date().toISOString();
  unwrap(await supabaseAdmin().from("cases").insert({
    id: caseId,
    title: detail.text.slice(0, 90),
    status: "open",
    assigned_to: assigned,
    created_by: assigned,
    summary: detail.recommendation,
    created_at: now,
    updated_at: now,
  }));
  unwrap(await supabaseAdmin().from("alerts").update({
    case_id: caseId,
    status: detail.alertStatus === "new" ? "triaged" : detail.alertStatus,
    assigned_to: assigned ?? detail.assignedTo,
    updated_at: now,
  }).eq("id", alertId));
  return caseId;
}

export async function updateCaseStatus(session: Session, alertId: string, status: CaseStatus): Promise<void> {
  const detail = await getCase(alertId);
  if (!detail?.caseId) throw new Error("Berkas belum dibuka.");
  if (!canMutate(session, detail.assignedTo)) throw new Error("Analis hanya dapat mengubah berkas yang ditugaskan kepadanya.");
  unwrap(await supabaseAdmin().from("cases").update({ status, updated_at: new Date().toISOString() }).eq("id", detail.caseId));
}

export async function saveAnalystNote(session: Session, alertId: string, note: string): Promise<void> {
  const caseId = (await getCase(alertId))?.caseId ?? await openCase(session, alertId);
  const clean = note.replace(/\u0000/g, "").trim().slice(0, 2000);
  unwrap(await supabaseAdmin().from("cases").update({
    analyst_note: clean,
    updated_at: new Date().toISOString(),
  }).eq("id", caseId));
}

export async function listAudit(session: Session): Promise<AuditEntry[]> {
  if (session.role !== "admin") throw new Error("Log audit hanya untuk admin.");
  const rows = unwrap(await supabaseAdmin().from("audit_log").select("id, table_name, row_id, action, actor, diff, created_at").order("id", { ascending: false }).limit(AUDIT_LIST_LIMIT));
  return (rows as Record<string, unknown>[]).map((row) => ({
    id: Number(row.id),
    tableName: String(row.table_name),
    rowId: row.row_id ? String(row.row_id) : null,
    action: String(row.action),
    actor: row.actor ? String(row.actor) : null,
    diff: JSON.stringify(row.diff ?? {}),
    createdAt: String(row.created_at),
  }));
}

export async function rescoreAlert(session: Session, alertId: string, card: ScoreCard, external: ExternalFact[]): Promise<void> {
  const detail = await getCase(alertId);
  if (!detail) throw new Error("Peringatan tidak ditemukan.");
  if (!canMutate(session, detail.assignedTo)) throw new Error("Analis hanya dapat meninjau ulang peringatan yang ditugaskan kepadanya.");
  const row = unwrap(await supabaseAdmin().from("alerts").select("analysis_id").eq("id", alertId).single()) as { analysis_id: string };
  unwrap(await supabaseAdmin().from("analyses").update({
    input_text: card.clean,
    hoax_score: card.assessment.probability,
    topic_tags: card.topics.map((topic) => topic.id),
    ai_flag: card.assessment.ai.flagged,
    ai_score: card.assessment.ai.score,
    model_version: card.assessment.modelVersion,
    embedding: `[${card.embedding.join(",")}]`,
    rationale: {
      engine: card.assessment.engine,
      sensitivity: card.sensitivity,
      topics: card.topics,
      assessment: card.assessment,
      external,
      recommendation: recommendation(card.band),
    },
  }).eq("id", row.analysis_id));
  unwrap(await supabaseAdmin().from("matches").delete().eq("analysis_id", row.analysis_id));
  if (card.matches.length > 0) {
    unwrap(await supabaseAdmin().from("matches").insert(card.matches.map((match) => ({
      id: crypto.randomUUID(),
      analysis_id: row.analysis_id,
      fact_check_id: match.id,
      similarity: match.similarity,
    }))));
  }
  unwrap(await supabaseAdmin().from("alerts").update({
    risk_score: card.risk,
    virality: card.virality,
    updated_at: new Date().toISOString(),
  }).eq("id", alertId));
}

export async function purgeOldDemo(session: Session): Promise<number> {
  if (session.role !== "admin") throw new Error("Retensi hanya untuk admin.");
  const cutoff = new Date(Date.now() - DEMO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const posts = unwrap(await supabaseAdmin().from("posts").select("id, posted_at").eq("demo", true).lt("posted_at", cutoff)) as { id: string }[];
  let removed = 0;
  for (const post of posts) {
    const linked = await supabaseAdmin().from("analyses").select("id, alerts!inner(case_id)").eq("post_id", post.id);
    const rows = (linked.data ?? []) as { alerts?: { case_id?: string | null }[] }[];
    const hasCase = rows.some((row) => (row.alerts ?? []).some((alert) => alert.case_id));
    if (hasCase) continue;
    unwrap(await supabaseAdmin().from("posts").delete().eq("id", post.id));
    removed += 1;
  }
  return removed;
}
