/**
 * Klien ke proses IndoBERT di mesin sendiri atau Cloud Run.
 * Tidak ada Inference API dan tidak ada token Hugging Face.
 * Teks dikirim sebagai field `text`, bukan sebagai instruksi.
 *
 * Cold start Cloud Run (scale-to-zero) bisa puluhan detik.
 * Timeout jarak jauh lebih panjang. Jika habis, pemanggil memakai model linier
 * dan menandai status "bangun".
 */

export type LocalModelScore = {
  probability: number;
  label: string;
  model: string;
  version: string;
};

export type ModelAvailability = "siap" | "bangun" | "mati" | "dilewati";

export type ModelProbe =
  | { state: "siap"; score: LocalModelScore }
  | { state: "bangun"; reason: string }
  | { state: "mati"; reason: string }
  | { state: "dilewati"; reason: string };

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function resolveModelEndpoint(): { url: URL; remote: boolean } | null {
  const raw = process.env.LOCAL_HOAX_URL || "http://127.0.0.1:43124/classify";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const remote = !LOOPBACK.has(url.hostname);
  if (!remote) {
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { url, remote: false };
  }
  if (url.protocol !== "https:") return null;
  if (!process.env.LOCAL_MODEL_TOKEN?.trim()) return null;
  return { url, remote: true };
}

function timeoutMs(remote: boolean): number {
  const fromEnv = Number(process.env.MODEL_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv >= 3000 && fromEnv <= 120000) return fromEnv;
  return remote ? 60000 : 8000;
}

export async function probeLocalIndoBert(text: string): Promise<ModelProbe> {
  const target = resolveModelEndpoint();
  if (!target) {
    return { state: "mati", reason: "URL model tidak diizinkan atau token layanan kosong." };
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = process.env.LOCAL_MODEL_TOKEN?.trim();
  if (token) headers["x-kartika-model-token"] = token;
  try {
    const response = await fetch(target.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: text.slice(0, 4000) }),
      signal: AbortSignal.timeout(timeoutMs(target.remote)),
    });
    if (response.status === 401) {
      return { state: "mati", reason: "Token layanan model ditolak." };
    }
    if (!response.ok) {
      return {
        state: target.remote ? "bangun" : "mati",
        reason: `Layanan model menjawab HTTP ${response.status}.`,
      };
    }
    const payload = (await response.json()) as {
      available?: boolean;
      warming?: boolean;
      hoaxProbability?: number;
      label?: string;
      model?: string;
      error?: string;
    };
    if (payload.available && typeof payload.hoaxProbability === "number") {
      const model = payload.model || "umn-cyber/indobert-hoax";
      return {
        state: "siap",
        score: {
          probability: Math.min(1, Math.max(0, payload.hoaxProbability)),
          label: payload.label || "LABEL",
          model,
          version: `indobert-local:${model}`,
        },
      };
    }
    return {
      state: "bangun",
      reason: payload.error || "Model belum selesai dimuat.",
    };
  } catch {
    return {
      state: target.remote ? "bangun" : "mati",
      reason: target.remote
        ? "Layanan model belum menjawab. Cold start Cloud Run sedang berjalan, atau waktu tunggu habis."
        : "Proses model lokal tidak menjawab.",
    };
  }
}

export async function classifyWithLocalIndoBert(text: string): Promise<LocalModelScore | null> {
  const probe = await probeLocalIndoBert(text);
  return probe.state === "siap" ? probe.score : null;
}

export async function localIndoBertHealth(): Promise<ModelAvailability> {
  const target = resolveModelEndpoint();
  if (!target) return "mati";
  try {
    const health = new URL("/health", target.url);
    const response = await fetch(health, { signal: AbortSignal.timeout(target.remote ? 4000 : 800) });
    if (!response.ok) return target.remote ? "bangun" : "mati";
    const payload = (await response.json()) as { ready?: boolean };
    if (payload.ready) return "siap";
    return "bangun";
  } catch {
    return target.remote ? "bangun" : "mati";
  }
}
