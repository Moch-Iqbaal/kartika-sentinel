import "server-only";
import { configuredBackend } from "@/lib/db/backend";
import * as sqlite from "@/lib/db/store";
import * as supabase from "@/lib/db/supabase-store";

function remote() {
  return configuredBackend() === "supabase";
}

export async function listAlerts() {
  return remote() ? supabase.listAlerts() : sqlite.listAlerts();
}

export async function velocitySeries() {
  return remote() ? supabase.velocitySeries() : sqlite.velocitySeries();
}

export async function topicCounts() {
  return remote() ? supabase.topicCounts() : sqlite.topicCounts();
}

export async function getCase(alertId: string) {
  return remote() ? supabase.getCase(alertId) : sqlite.getCase(alertId);
}

export async function corpusFromDb() {
  return remote() ? supabase.corpusFromDb() : sqlite.corpusFromDb();
}

export async function ensureReady() {
  return remote() ? supabase.ensureReady() : sqlite.ensureReady();
}

export async function saveScoredAlert(input: Parameters<typeof sqlite.saveScoredAlert>[0]) {
  return remote() ? supabase.saveScoredAlert(input) : sqlite.saveScoredAlert(input);
}

export async function updateAlertStatus(...args: Parameters<typeof sqlite.updateAlertStatus>) {
  return remote() ? supabase.updateAlertStatus(...args) : sqlite.updateAlertStatus(...args);
}

export async function openCase(...args: Parameters<typeof sqlite.openCase>) {
  return remote() ? supabase.openCase(...args) : sqlite.openCase(...args);
}

export async function updateCaseStatus(...args: Parameters<typeof sqlite.updateCaseStatus>) {
  return remote() ? supabase.updateCaseStatus(...args) : sqlite.updateCaseStatus(...args);
}

export async function listAudit(...args: Parameters<typeof sqlite.listAudit>) {
  return remote() ? supabase.listAudit(...args) : sqlite.listAudit(...args);
}

export async function rescoreAlert(...args: Parameters<typeof sqlite.rescoreAlert>) {
  return remote() ? supabase.rescoreAlert(...args) : sqlite.rescoreAlert(...args);
}

export async function purgeOldDemo(...args: Parameters<typeof sqlite.purgeOldDemo>) {
  return remote() ? supabase.purgeOldDemo(...args) : sqlite.purgeOldDemo(...args);
}

export async function saveAnalystNote(...args: Parameters<typeof sqlite.saveAnalystNote>) {
  return remote() ? supabase.saveAnalystNote(...args) : sqlite.saveAnalystNote(...args);
}

export { configuredBackend } from "@/lib/db/backend";
