import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { scoreContentSync, type ScoreCard } from "@/lib/analyze/score";
import { DEMO_ADMIN_ID, DEMO_ANALYST_ID, demoAccounts } from "@/lib/auth/demo-users";
import type { Session } from "@/lib/auth/token";
import type { ExternalFact, FactCheck, FactMatch } from "@/lib/factcheck/types";
import { assessmentIsUnscored } from "@/lib/analyze/unscored";
import { articleUrlFor } from "@/lib/factcheck/turnbackhoax";
import { strongMatches } from "@/lib/factcheck/threshold";
import { cardRecommendation, recommendation } from "@/lib/format";
import type { HoaxAssessment } from "@/lib/model/classify";
import type { AiTextFlag } from "@/lib/model/ai-text";
import type { TopicHit } from "@/lib/ontology/topics";
import { AUDIT_LIST_LIMIT, DEMO_RETENTION_DAYS } from "@/lib/limits";
import { hashHandle } from "@/lib/security/redact";
import { riskBand, viralityFromMetrics, type MetricPoint } from "@/lib/scoring/risk";
import { parseCsv } from "@/lib/text/csv";
import type {
  AlertListItem,
  AlertStatus,
  AuditEntry,
  CaseDetail,
  CaseStatus,
  VelocitySeries,
} from "@/lib/db/types";

const SEED_VERSION = "3";

type Row = Record<string, unknown>;

function runtimeDir(): string {
  const preferred = process.env.DATA_DIR || path.join(process.cwd(), "data", "runtime");
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    const fallback = path.join(os.tmpdir(), "kartika-sentinel");
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

let database: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (database) return database;
  const file = path.join(runtimeDir(), "kartika.sqlite");
  const opened = new DatabaseSync(file);
  opened.exec("PRAGMA foreign_keys = ON");
  opened.exec("PRAGMA journal_mode = WAL");
  migrate(opened);
  seed(opened);
  database = opened;
  return opened;
}

function migrate(opened: DatabaseSync): void {
  opened.exec(`
    create table if not exists meta (key text primary key, value text not null);
    create table if not exists analysts (
      id text primary key,
      email text not null unique,
      role text not null check (role in ('analyst', 'admin')),
      created_at text not null
    );
    create table if not exists posts (
      id text primary key,
      platform text not null,
      external_id text not null,
      url text,
      author_handle_hash text,
      content text not null,
      posted_at text,
      demo integer not null default 0,
      created_at text not null,
      unique (platform, external_id)
    );
    create table if not exists analyses (
      id text primary key,
      post_id text references posts(id) on delete set null,
      input_text text not null,
      hoax_score real not null check (hoax_score >= 0 and hoax_score <= 1),
      topic_tags text not null,
      ai_flag integer not null,
      ai_score real,
      model_version text not null,
      embedding text not null,
      rationale text not null,
      created_at text not null
    );
    create table if not exists fact_checks (
      id text primary key,
      source text not null,
      title text not null,
      claim text not null,
      verdict text not null check (verdict in ('hoax', 'misleading', 'true', 'unverified')),
      url text,
      published_at text,
      summary text,
      license text,
      embedding text not null,
      created_at text not null
    );
    create table if not exists matches (
      id text primary key,
      analysis_id text not null references analyses(id) on delete cascade,
      fact_check_id text not null references fact_checks(id) on delete cascade,
      similarity real not null,
      unique (analysis_id, fact_check_id)
    );
    create table if not exists cases (
      id text primary key,
      title text not null,
      status text not null check (status in ('open', 'investigating', 'closed')),
      assigned_to text references analysts(id),
      created_by text references analysts(id),
      summary text,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists alerts (
      id text primary key,
      analysis_id text not null references analyses(id) on delete cascade,
      case_id text references cases(id) on delete set null,
      risk_score real not null check (risk_score >= 0 and risk_score <= 1),
      status text not null check (status in ('new', 'triaged', 'escalated', 'dismissed')),
      assigned_to text references analysts(id),
      virality real,
      created_at text not null,
      updated_at text not null
    );
    create index if not exists alerts_open_risk on alerts (risk_score desc) where status in ('new', 'triaged');
    create table if not exists audit_log (
      id integer primary key autoincrement,
      table_name text not null,
      row_id text,
      action text not null,
      actor text,
      diff text not null,
      created_at text not null
    );
    create table if not exists post_metrics (
      post_id text not null references posts(id) on delete cascade,
      observed_at text not null,
      likes integer not null,
      shares integer not null,
      comments integer not null,
      primary key (post_id, observed_at)
    );
  `);
  ensureCaseNoteColumn(opened);
}

function loadCorpus(): FactCheck[] {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/seed/fact-checks.json"), "utf8")) as FactCheck[];
}

function ensureCaseNoteColumn(opened: DatabaseSync): void {
  const columns = opened.prepare("pragma table_info(cases)").all() as { name?: string }[];
  if (!columns.some((column) => column.name === "analyst_note")) {
    opened.exec("alter table cases add column analyst_note text");
  }
}

function seed(opened: DatabaseSync): void {
  const existing = opened.prepare("select value from meta where key = 'seed'").get() as { value?: string } | undefined;
  if (existing?.value === SEED_VERSION) return;
  opened.exec("delete from matches");
  opened.exec("delete from alerts");
  opened.exec("delete from analyses");
  opened.exec("delete from post_metrics");
  opened.exec("delete from cases");
  opened.exec("delete from posts");
  opened.exec("delete from fact_checks");
  const now = new Date().toISOString();
  const insertAnalyst = opened.prepare(
    "insert or ignore into analysts (id, email, role, created_at) values (?, ?, ?, ?)",
  );
  insertAnalyst.run(DEMO_ANALYST_ID, "analis@kartika.local", "analyst", now);
  insertAnalyst.run(DEMO_ADMIN_ID, "admin@kartika.local", "admin", now);
  for (const account of demoAccounts()) {
    opened.prepare("update analysts set email = ? where id = ?").run(account.email, account.id);
  }

  const corpus = loadCorpus();
  const insertFact = opened.prepare(`
    insert or replace into fact_checks
      (id, source, title, claim, verdict, url, published_at, summary, license, embedding, created_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)
  `);
  for (const fact of corpus) {
    insertFact.run(
      fact.id, fact.source, fact.title, fact.claim, fact.verdict,
      fact.url, fact.publishedAt, fact.summary, fact.license, now,
    );
  }

  const posts = parseCsv(fs.readFileSync(path.join(process.cwd(), "data/seed/demo-posts.csv"), "utf8"));
  const metricRows = parseCsv(fs.readFileSync(path.join(process.cwd(), "data/seed/demo-metrics.csv"), "utf8"));
  const metricsById = new Map<string, MetricPoint[]>();
  for (const row of metricRows) {
    const list = metricsById.get(row.external_id) ?? [];
    list.push({
      observedAt: row.observed_at,
      likes: Number(row.likes) || 0,
      shares: Number(row.shares) || 0,
      comments: Number(row.comments) || 0,
    });
    metricsById.set(row.external_id, list);
  }

  for (const post of posts) {
    const points = metricsById.get(post.external_id) ?? [];
    const card = scoreContentSync(post.content, viralityFromMetrics(points), corpus);
    insertCard(opened, {
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
  opened.prepare("insert or replace into meta (key, value) values ('seed', ?)").run(SEED_VERSION);
}

function canMutate(session: Session, assignedTo: string | null): boolean {
  if (session.role === "admin") return true;
  if (!assignedTo) return true;
  return assignedTo === session.sub;
}

function writeAudit(opened: DatabaseSync, table: string, rowId: string, action: string, actor: string | null, diff: unknown): void {
  opened.prepare(
    "insert into audit_log (table_name, row_id, action, actor, diff, created_at) values (?, ?, ?, ?, ?, ?)",
  ).run(table, rowId, action, actor, JSON.stringify(diff), new Date().toISOString());
}

function insertCard(
  opened: DatabaseSync,
  input: {
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
  },
): string {
  const now = new Date().toISOString();
  const postId = crypto.randomUUID();
  const analysisId = crypto.randomUUID();
  const alertId = crypto.randomUUID();
  const authorHash = hashHandle(input.authorHandle);
  const rationale = {
    engine: input.card.assessment.engine,
    sensitivity: input.card.sensitivity,
    topics: input.card.topics,
    assessment: input.card.assessment,
    external: input.external,
    recommendation: cardRecommendation(input.card.band, input.card.assessment.unscored?.nextStep),
  };
  opened.exec("begin");
  try {
    opened.prepare(`
      insert into posts (id, platform, external_id, url, author_handle_hash, content, posted_at, demo, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      postId,
      input.platform,
      input.externalId,
      input.url,
      authorHash,
      input.card.clean,
      input.postedAt,
      input.demo ? 1 : 0,
      now,
    );
    for (const point of input.metrics) {
      opened.prepare(
        "insert into post_metrics (post_id, observed_at, likes, shares, comments) values (?, ?, ?, ?, ?)",
      ).run(postId, point.observedAt, point.likes, point.shares, point.comments);
    }
    opened.prepare(`
      insert into analyses
        (id, post_id, input_text, hoax_score, topic_tags, ai_flag, ai_score, model_version, embedding, rationale, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      analysisId,
      postId,
      input.card.clean,
      input.card.assessment.probability,
      JSON.stringify(input.card.topics.map((topic) => topic.id)),
      input.card.assessment.ai.flagged ? 1 : 0,
      input.card.assessment.ai.score,
      input.card.assessment.modelVersion,
      JSON.stringify(input.card.embedding),
      JSON.stringify(rationale),
      now,
    );
    const insertMatch = opened.prepare(
      "insert into matches (id, analysis_id, fact_check_id, similarity) values (?, ?, ?, ?)",
    );
    for (const match of input.card.matches) {
      insertMatch.run(crypto.randomUUID(), analysisId, match.id, match.similarity);
    }
    opened.prepare(`
      insert into alerts
        (id, analysis_id, case_id, risk_score, status, assigned_to, virality, created_at, updated_at)
      values (?, ?, null, ?, 'new', ?, ?, ?, ?)
    `).run(alertId, analysisId, input.card.risk, DEMO_ANALYST_ID, input.card.virality, now, now);
    writeAudit(opened, "alerts", alertId, "INSERT", input.actor, { status: "new", risk: input.card.risk });
    opened.exec("commit");
  } catch (error) {
    opened.exec("rollback");
    throw error;
  }
  return alertId;
}

function rationaleIsUnscored(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as { assessment?: { unscored?: { reason?: string } } };
    return assessmentIsUnscored(parsed.assessment);
  } catch {
    return false;
  }
}

function mapList(row: Row): AlertListItem {
  const riskScore = num(row.risk_score);
  return {
    id: text(row.id),
    riskScore,
    band: riskBand(riskScore),
    status: text(row.status) as AlertStatus,
    virality: num(row.virality),
    hoaxScore: num(row.hoax_score),
    unscored: rationaleIsUnscored(text(row.rationale)),
    topicTags: JSON.parse(text(row.topic_tags) || "[]") as string[],
    aiFlag: num(row.ai_flag) === 1,
    modelVersion: text(row.model_version),
    excerpt: text(row.input_text).slice(0, 180),
    platform: text(row.platform),
    authorHash: text(row.author_handle_hash) || null,
    postedAt: text(row.posted_at) || null,
    demo: num(row.demo) === 1,
  };
}

export function listAlerts(): AlertListItem[] {
  const rows = db().prepare(`
    select a.id, a.risk_score, a.status, a.virality, an.hoax_score, an.topic_tags, an.ai_flag,
           an.model_version, an.input_text, an.rationale, p.platform, p.author_handle_hash, p.posted_at, p.demo
    from alerts a
    join analyses an on an.id = a.analysis_id
    left join posts p on p.id = an.post_id
    order by a.risk_score desc
  `).all() as Row[];
  return rows.map(mapList);
}

export function velocitySeries(): VelocitySeries[] {
  const alerts = listAlerts().slice(0, 4);
  return alerts.map((alert) => {
    const rows = db().prepare(`
      select m.observed_at, m.likes, m.shares, m.comments
      from post_metrics m
      join posts p on p.id = m.post_id
      join analyses an on an.post_id = p.id
      join alerts a on a.analysis_id = an.id
      where a.id = ?
      order by m.observed_at
    `).all(alert.id) as Row[];
    return {
      id: alert.id,
      label: alert.topicTags[0] ?? alert.id.slice(0, 8),
      points: rows.map((row) => ({
        observedAt: text(row.observed_at),
        likes: num(row.likes),
        shares: num(row.shares),
        comments: num(row.comments),
      })),
    };
  });
}

export function topicCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const alert of listAlerts()) {
    for (const tag of alert.topicTags) counts[tag] = (counts[tag] ?? 0) + 1;
  }
  return counts;
}

export function getCase(alertId: string): CaseDetail | null {
  const row = db().prepare(`
    select a.id as alert_id, a.risk_score, a.status as alert_status, a.virality, a.assigned_to, a.case_id,
           an.input_text, an.hoax_score, an.model_version, an.rationale, an.id as analysis_id,
           p.platform, p.author_handle_hash, p.url, p.demo, p.posted_at, p.id as post_id,
           c.title as case_title, c.status as case_status, c.analyst_note
    from alerts a
    join analyses an on an.id = a.analysis_id
    left join posts p on p.id = an.post_id
    left join cases c on c.id = a.case_id
    where a.id = ?
  `).get(alertId) as Row | undefined;
  if (!row) return null;
  const rationale = JSON.parse(text(row.rationale) || "{}") as {
    sensitivity?: number;
    topics?: TopicHit[];
    assessment?: HoaxAssessment;
    external?: ExternalFact[];
    recommendation?: string;
  };
  const matchRows = db().prepare(`
    select f.id, f.source, f.title, f.claim, f.verdict, f.url, f.published_at, f.summary, f.license, m.similarity
    from matches m
    join fact_checks f on f.id = m.fact_check_id
    where m.analysis_id = ?
    order by m.similarity desc
  `).all(text(row.analysis_id)) as Row[];
  const metrics = db().prepare(
    "select observed_at, likes, shares, comments from post_metrics where post_id = ? order by observed_at",
  ).all(text(row.post_id)) as Row[];
  const riskScore = num(row.risk_score);
  const band = riskBand(riskScore);
  const assessment = rationale.assessment ?? {
    probability: num(row.hoax_score),
    engine: "heuristic" as const,
    modelVersion: text(row.model_version),
    indobert: null,
    linear: null,
    heuristic: { probability: num(row.hoax_score), reasons: [] },
    ai: { flagged: false, score: 0, confidence: "rendah", reasons: [], signals: [], disclaimer: "" } satisfies AiTextFlag,
    modelStatus: "dilewati",
  };
  return {
    alertId: text(row.alert_id),
    riskScore,
    band,
    alertStatus: text(row.alert_status) as AlertStatus,
    virality: num(row.virality),
    hoaxScore: num(row.hoax_score),
    sensitivity: rationale.sensitivity ?? 0,
    modelVersion: text(row.model_version),
    engine: assessment.engine,
    text: text(row.input_text),
    topics: rationale.topics ?? [],
    ai: assessment.ai,
    assessment,
    matches: strongMatches(matchRows.map((match) => ({
      id: text(match.id),
      source: text(match.source),
      title: text(match.title),
      claim: text(match.claim),
      verdict: text(match.verdict) as FactMatch["verdict"],
      url: articleUrlFor(text(match.source), text(match.title), text(match.url) || null),
      publishedAt: text(match.published_at) || null,
      summary: text(match.summary),
      license: text(match.license),
      similarity: num(match.similarity),
    }))),
    external: rationale.external ?? [],
    metrics: metrics.map((metric) => ({
      observedAt: text(metric.observed_at),
      likes: num(metric.likes),
      shares: num(metric.shares),
      comments: num(metric.comments),
    })),
    platform: text(row.platform),
    authorHash: text(row.author_handle_hash) || null,
    sourceUrl: text(row.url) || null,
    demo: num(row.demo) === 1,
    postedAt: text(row.posted_at) || null,
    caseId: text(row.case_id) || null,
    caseTitle: text(row.case_title) || null,
    caseStatus: (text(row.case_status) || null) as CaseStatus | null,
    assignedTo: text(row.assigned_to) || null,
    recommendation: rationale.recommendation ?? recommendation(band),
    analystNote: text(row.analyst_note) || null,
    modelStatus: assessment.modelStatus ?? "dilewati",
    timeline: buildTimeline(text(row.alert_id), text(row.case_id), text(row.posted_at), metrics.map((metric) => ({
      observedAt: text(metric.observed_at),
      likes: num(metric.likes),
      shares: num(metric.shares),
      comments: num(metric.comments),
    }))),
  };
}

function buildTimeline(
  alertId: string,
  caseId: string,
  postedAt: string,
  metrics: MetricPoint[],
): { at: string; label: string; detail: string }[] {
  const events: { at: string; label: string; detail: string }[] = [];
  if (postedAt) events.push({ at: postedAt, label: "Terbit", detail: "Waktu pada umpan atau masukan." });
  for (const point of metrics) {
    events.push({
      at: point.observedAt,
      label: "Sebaran",
      detail: `${point.shares} sebar, ${point.likes} suka, ${point.comments} komentar`,
    });
  }
  const audits = db().prepare(`
    select created_at, action, diff from audit_log
    where (table_name = 'alerts' and row_id = ?) or (table_name = 'cases' and row_id = ?)
    order by id
  `).all(alertId, caseId) as Row[];
  for (const entry of audits) {
    events.push({ at: text(entry.created_at), label: text(entry.action), detail: text(entry.diff).slice(0, 180) });
  }
  return events.sort((left, right) => left.at.localeCompare(right.at));
}

export function corpusFromDb(): FactCheck[] {
  const rows = db().prepare(
    "select id, source, title, claim, verdict, url, published_at, summary, license from fact_checks",
  ).all() as Row[];
  return rows.map((row) => ({
    id: text(row.id),
    source: text(row.source),
    title: text(row.title),
    claim: text(row.claim),
    verdict: text(row.verdict) as FactCheck["verdict"],
    url: text(row.url) || null,
    publishedAt: text(row.published_at) || null,
    summary: text(row.summary),
    license: text(row.license),
  }));
}

export function rescoreAlert(session: Session, alertId: string, card: ScoreCard, external: ExternalFact[]): void {
  const current = db().prepare(`
    select a.status, a.assigned_to, a.analysis_id
    from alerts a where a.id = ?
  `).get(alertId) as Row | undefined;
  if (!current) throw new Error("Peringatan tidak ditemukan.");
  if (!canMutate(session, text(current.assigned_to) || null)) {
    throw new Error("Analis hanya dapat meninjau ulang peringatan yang ditugaskan kepadanya.");
  }
  const analysisId = text(current.analysis_id);
  const now = new Date().toISOString();
  const rationale = {
    engine: card.assessment.engine,
    sensitivity: card.sensitivity,
    topics: card.topics,
    assessment: card.assessment,
    external,
    recommendation: cardRecommendation(card.band, card.assessment.unscored?.nextStep),
  };
  db().exec("begin");
  try {
    db().prepare(`
      update analyses
      set input_text = ?, hoax_score = ?, topic_tags = ?, ai_flag = ?, ai_score = ?,
          model_version = ?, embedding = ?, rationale = ?
      where id = ?
    `).run(
      card.clean,
      card.assessment.probability,
      JSON.stringify(card.topics.map((topic) => topic.id)),
      card.assessment.ai.flagged ? 1 : 0,
      card.assessment.ai.score,
      card.assessment.modelVersion,
      JSON.stringify(card.embedding),
      JSON.stringify(rationale),
      analysisId,
    );
    db().prepare("delete from matches where analysis_id = ?").run(analysisId);
    const insertMatch = db().prepare(
      "insert into matches (id, analysis_id, fact_check_id, similarity) values (?, ?, ?, ?)",
    );
    for (const match of card.matches) {
      insertMatch.run(crypto.randomUUID(), analysisId, match.id, match.similarity);
    }
    db().prepare("update alerts set risk_score = ?, virality = ?, updated_at = ? where id = ?").run(
      card.risk, card.virality, now, alertId,
    );
    writeAudit(db(), "alerts", alertId, "UPDATE", session.sub, {
      old: { status: text(current.status) },
      new: { rescored: true, model: card.assessment.modelVersion, risk: card.risk },
    });
    db().exec("commit");
  } catch (error) {
    db().exec("rollback");
    throw error;
  }
}

export function saveScoredAlert(input: {
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
}): string {
  return insertCard(db(), input);
}

export function updateAlertStatus(session: Session, alertId: string, status: AlertStatus): void {
  const current = db().prepare("select status, assigned_to from alerts where id = ?").get(alertId) as Row | undefined;
  if (!current) throw new Error("Peringatan tidak ditemukan.");
  if (!canMutate(session, text(current.assigned_to) || null)) {
    throw new Error("Analis hanya dapat mengubah peringatan yang ditugaskan kepadanya.");
  }
  const now = new Date().toISOString();
  db().exec("begin");
  try {
    db().prepare("update alerts set status = ?, updated_at = ? where id = ?").run(status, now, alertId);
    writeAudit(db(), "alerts", alertId, "UPDATE", session.sub, {
      old: { status: text(current.status) },
      new: { status },
    });
    db().exec("commit");
  } catch (error) {
    db().exec("rollback");
    throw error;
  }
}

export function openCase(session: Session, alertId: string): string {
  const detail = getCase(alertId);
  if (!detail) throw new Error("Peringatan tidak ditemukan.");
  if (!canMutate(session, detail.assignedTo)) {
    throw new Error("Analis hanya dapat membuka berkas yang ditugaskan kepadanya.");
  }
  if (detail.caseId) return detail.caseId;
  const caseId = crypto.randomUUID();
  const now = new Date().toISOString();
  const title = detail.text.slice(0, 90);
  db().exec("begin");
  try {
    db().prepare(`
      insert into cases (id, title, status, assigned_to, created_by, summary, created_at, updated_at)
      values (?, ?, 'open', ?, ?, ?, ?, ?)
    `).run(caseId, title, session.sub, session.sub, detail.recommendation, now, now);
    const nextStatus = detail.alertStatus === "new" ? "triaged" : detail.alertStatus;
    db().prepare("update alerts set case_id = ?, status = ?, updated_at = ? where id = ?").run(
      caseId, nextStatus, now, alertId,
    );
    writeAudit(db(), "cases", caseId, "INSERT", session.sub, { alertId, status: "open" });
    writeAudit(db(), "alerts", alertId, "UPDATE", session.sub, {
      old: { status: detail.alertStatus, caseId: null },
      new: { status: nextStatus, caseId },
    });
    db().exec("commit");
  } catch (error) {
    db().exec("rollback");
    throw error;
  }
  return caseId;
}

export function updateCaseStatus(session: Session, alertId: string, status: CaseStatus): void {
  const detail = getCase(alertId);
  if (!detail?.caseId) throw new Error("Berkas belum dibuka.");
  if (!canMutate(session, detail.assignedTo)) {
    throw new Error("Analis hanya dapat mengubah berkas yang ditugaskan kepadanya.");
  }
  const now = new Date().toISOString();
  db().exec("begin");
  try {
    db().prepare("update cases set status = ?, updated_at = ? where id = ?").run(status, now, detail.caseId);
    writeAudit(db(), "cases", detail.caseId, "UPDATE", session.sub, {
      old: { status: detail.caseStatus },
      new: { status },
    });
    db().exec("commit");
  } catch (error) {
    db().exec("rollback");
    throw error;
  }
}

export function listAudit(session: Session): AuditEntry[] {
  if (session.role !== "admin") throw new Error("Log audit hanya untuk admin.");
  const rows = db().prepare(
    `select id, table_name, row_id, action, actor, diff, created_at from audit_log order by id desc limit ${AUDIT_LIST_LIMIT}`,
  ).all() as Row[];
  return rows.map((row) => ({
    id: num(row.id),
    tableName: text(row.table_name),
    rowId: text(row.row_id) || null,
    action: text(row.action),
    actor: text(row.actor) || null,
    diff: text(row.diff),
    createdAt: text(row.created_at),
  }));
}

export function purgeOldDemo(session: Session): number {
  if (session.role !== "admin") throw new Error("Retensi hanya untuk admin.");
  const cutoff = Date.now() - DEMO_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const posts = db().prepare("select id, posted_at from posts where demo = 1").all() as Row[];
  let removed = 0;
  for (const post of posts) {
    const posted = new Date(text(post.posted_at)).getTime();
    if (!Number.isFinite(posted) || posted >= cutoff) continue;
    const linked = db().prepare(`
      select 1 as ok from analyses a
      join alerts al on al.analysis_id = a.id
      where a.post_id = ? and al.case_id is not null
    `).get(text(post.id)) as Row | undefined;
    if (linked) continue;
    db().prepare("delete from posts where id = ?").run(text(post.id));
    removed += 1;
  }
  if (removed > 0) {
    writeAudit(db(), "posts", "purge", "DELETE", session.sub, { removed, olderThanDays: DEMO_RETENTION_DAYS });
  }
  return removed;
}

export function saveAnalystNote(session: Session, alertId: string, note: string): void {
  const detail = getCase(alertId);
  if (!detail) throw new Error("Peringatan tidak ditemukan.");
  if (!canMutate(session, detail.assignedTo)) {
    throw new Error("Analis hanya dapat menulis catatan pada berkas yang ditugaskan kepadanya.");
  }
  const caseId = detail.caseId ?? openCase(session, alertId);
  const clean = note.replace(/\u0000/g, "").trim().slice(0, 2000);
  const now = new Date().toISOString();
  db().prepare("update cases set analyst_note = ?, updated_at = ? where id = ?").run(clean, now, caseId);
  writeAudit(db(), "cases", caseId, "UPDATE", session.sub, { analystNote: true, length: clean.length });
}

export function ensureReady(): void {
  db();
}
