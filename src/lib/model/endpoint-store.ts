import "server-only";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { classifyUrl, heartbeatFresh } from "@/lib/model/register";

export type StoredEndpoint = {
  url: string;
  token: string;
  seenAtMs: number;
};

const CACHE_MS = 20_000;

let cache: { at: number; row: StoredEndpoint | null } | null = null;

function supabaseReady(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export function clearEndpointCache(): void {
  cache = null;
}

export async function upsertModelEndpoint(url: string, token: string, seenAt = new Date()): Promise<void> {
  if (!supabaseReady()) throw new Error("Supabase tidak dikonfigurasi.");
  const { error } = await supabaseAdmin().from("model_endpoint").upsert({
    id: "current",
    url,
    token,
    seen_at: seenAt.toISOString(),
  });
  if (error) throw new Error(error.message);
  clearEndpointCache();
}

export async function readModelEndpoint(now = Date.now()): Promise<StoredEndpoint | null> {
  if (!supabaseReady()) return null;
  if (cache && now - cache.at < CACHE_MS) return cache.row;
  const { data, error } = await supabaseAdmin()
    .from("model_endpoint")
    .select("url, token, seen_at")
    .eq("id", "current")
    .maybeSingle();
  if (error || !data) {
    cache = { at: now, row: null };
    return null;
  }
  const seenAtMs = new Date(String(data.seen_at)).getTime();
  const row: StoredEndpoint = {
    url: String(data.url),
    token: String(data.token),
    seenAtMs,
  };
  cache = { at: now, row };
  return row;
}

export function endpointIsFresh(row: StoredEndpoint | null, now = Date.now()): boolean {
  if (!row) return false;
  return Boolean(classifyUrl(row.url)) && heartbeatFresh(row.seenAtMs, now);
}
