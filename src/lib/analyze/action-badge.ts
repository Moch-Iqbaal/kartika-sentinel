import type { ResultConfidence } from "./confidence";
import type { SummaryVerdict } from "./ringkasan";

/**
 * Label aksi di pojok kanan berkas.
 * Dipetakan ketat dari vonis + keyakinan yang sudah ada — tanpa ambang baru.
 *
 * FAKTA + Tinggi → Aman (tidak perlu pantau ketat)
 * FAKTA + Sedang → Cukup dipantau
 * FAKTA + Rendah → Perlu dicek (dasar vonis lemah)
 * HOAKS + Tinggi → Segera ditinjau
 * HOAKS + Sedang/Rendah → Perlu ditinjau
 * Belum dinilai → Belum bisa dinilai
 */
export type ActionBadgeTone = "aman" | "pantau" | "dicek" | "prioritas" | "kritis" | "kosong";

export type ActionBadge = {
  label: string;
  tone: ActionBadgeTone;
};

export function actionBadge(
  verdict: SummaryVerdict,
  confidence: "Tinggi" | "Sedang" | "Rendah" | null,
): ActionBadge {
  if (verdict === "unscored") {
    return { label: "Belum bisa dinilai", tone: "kosong" };
  }
  if (verdict === "hoax") {
    if (confidence === "Tinggi") return { label: "Segera ditinjau", tone: "kritis" };
    return { label: "Perlu ditinjau", tone: "prioritas" };
  }
  // not-hoax = Kemungkinan FAKTA
  if (confidence === "Tinggi") return { label: "Aman", tone: "aman" };
  if (confidence === "Rendah") return { label: "Perlu dicek", tone: "dicek" };
  return { label: "Cukup dipantau", tone: "pantau" };
}

/** Alias untuk uji / pemetaan dari ResultConfidence kecil. */
export function actionBadgeFromLevel(
  verdict: SummaryVerdict,
  level: ResultConfidence | null,
): ActionBadge {
  if (level == null) return actionBadge(verdict, null);
  if (level === "tinggi") return actionBadge(verdict, "Tinggi");
  if (level === "sedang") return actionBadge(verdict, "Sedang");
  return actionBadge(verdict, "Rendah");
}
