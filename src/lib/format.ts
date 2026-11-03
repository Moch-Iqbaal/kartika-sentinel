import type { RiskBand } from "@/lib/scoring/risk";
import type { Verdict } from "@/lib/factcheck/types";

export function percent(value: number): string {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value * 100)}%`;
}

export function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

export function bandLabel(band: RiskBand): string {
  if (band === "kritis") return "Kritis";
  if (band === "prioritas") return "Prioritas";
  return "Pantau";
}

export function alertStatusLabel(status: string): string {
  if (status === "new") return "Baru";
  if (status === "triaged") return "Ditriase";
  if (status === "escalated") return "Dieskalasi";
  if (status === "dismissed") return "Ditutup";
  return status;
}

export function caseStatusLabel(status: string): string {
  if (status === "open") return "Terbuka";
  if (status === "investigating") return "Diselidiki";
  if (status === "closed") return "Ditutup";
  return status;
}

export function verdictLabel(verdict: Verdict | string): string {
  if (verdict === "hoax") return "Hoaks";
  if (verdict === "misleading") return "Menyesatkan";
  if (verdict === "true") return "Benar";
  return "Belum terverifikasi";
}

export function engineLabel(engine: string): string {
  if (engine === "indobert-local") return "IndoBERT on-premise";
  if (engine === "linear-ngram") return "Model n-gram";
  if (engine === "heuristic") return "Heuristik";
  return engine;
}

/** Label yang tampil di dasbor. Kosongnya URL model adalah mode ringan, bukan kegagalan. */
export function modelModeLabel(status: string): string {
  if (status === "siap") return "IndoBERT on-premise";
  if (status === "bangun") return "IndoBERT on-premise · sedang bangun";
  if (status === "mati") return "IndoBERT on-premise · tidak tersambung";
  return "mode ringan";
}

export function cardRecommendation(band: RiskBand, nextStep?: string | null): string {
  if (nextStep) return nextStep;
  return recommendation(band);
}

export function recommendation(band: RiskBand): string {
  if (band === "kritis") {
    return "Prioritaskan peninjauan manusia. Jangan terbitkan sanggahan sebelum klaim dicocokkan ke sumber primer.";
  }
  if (band === "prioritas") {
    return "Masukkan ke antrean analis dan bandingkan dengan rilis resmi satuan sebelum eskalasi.";
  }
  return "Pantau. Skor belum menjadi dasar eskalasi, dan sistem tidak mengambil tindakan sendiri.";
}
