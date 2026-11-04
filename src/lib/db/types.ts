import type { ExternalFact, FactMatch, Verdict } from "@/lib/factcheck/types";
import type { AiTextFlag } from "@/lib/model/ai-text";
import type { HoaxAssessment } from "@/lib/model/classify";
import type { TopicHit } from "@/lib/ontology/topics";
import type { ModelAvailability } from "@/lib/model/local-indobert";
import type { MetricPoint, RiskBand } from "@/lib/scoring/risk";
import type { Session } from "@/lib/auth/token";

export type AlertStatus = "new" | "triaged" | "escalated" | "dismissed";
export type CaseStatus = "open" | "investigating" | "closed";

export type AlertListItem = {
  id: string;
  riskScore: number;
  band: RiskBand;
  status: AlertStatus;
  virality: number;
  hoaxScore: number;
  unscored: boolean;
  topicTags: string[];
  aiFlag: boolean;
  modelVersion: string;
  excerpt: string;
  platform: string;
  authorHash: string | null;
  postedAt: string | null;
  demo: boolean;
  /** Vonis akhir yang dihitung ulang saat dibaca. */
  verdictLabel: string;
  /** Label aksi sama dengan halaman berkas. */
  badgeLabel: string;
  badgeTone: string;
};

export type VelocitySeries = {
  id: string;
  label: string;
  points: MetricPoint[];
};

export type CaseDetail = {
  alertId: string;
  riskScore: number;
  band: RiskBand;
  alertStatus: AlertStatus;
  virality: number;
  hoaxScore: number;
  sensitivity: number;
  modelVersion: string;
  engine: string;
  text: string;
  topics: TopicHit[];
  ai: AiTextFlag;
  assessment: HoaxAssessment;
  matches: FactMatch[];
  external: ExternalFact[];
  metrics: MetricPoint[];
  platform: string;
  authorHash: string | null;
  sourceUrl: string | null;
  demo: boolean;
  postedAt: string | null;
  caseId: string | null;
  caseTitle: string | null;
  caseStatus: CaseStatus | null;
  assignedTo: string | null;
  recommendation: string;
  analystNote: string | null;
  modelStatus: ModelAvailability;
  timeline: { at: string; label: string; detail: string }[];
};

export type AuditEntry = {
  id: number;
  tableName: string;
  rowId: string | null;
  action: string;
  actor: string | null;
  diff: string;
  createdAt: string;
};

export type SavedInput = {
  platform: string;
  externalId: string;
  url: string | null;
  authorHandle: string | null;
  postedAt: string | null;
  demo: boolean;
  rawText: string;
  virality: number;
  metrics: MetricPoint[];
  allowIndobert: boolean;
  external?: ExternalFact[];
};

export type { Session, Verdict };
