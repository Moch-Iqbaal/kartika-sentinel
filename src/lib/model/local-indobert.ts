/**
 * Klien ke proses IndoBERT lokal (services/hoax/server.py).
 * Hanya 127.0.0.1 / localhost. Tidak ada token dan tidak ada Inference API.
 * Teks dikirim sebagai field data `text`, bukan sebagai instruksi alat.
 */

export type LocalModelScore = {
  probability: number;
  label: string;
  model: string;
  version: string;
};

const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost"]);

function endpoint(): URL | null {
  const raw = process.env.LOCAL_HOAX_URL || "http://127.0.0.1:43124/classify";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" || !ALLOWED_HOSTS.has(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

export async function classifyWithLocalIndoBert(text: string): Promise<LocalModelScore | null> {
  const url = endpoint();
  if (!url) return null;
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = process.env.LOCAL_MODEL_TOKEN?.trim();
  if (token) headers["x-kartika-model-token"] = token;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: text.slice(0, 4000) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      available?: boolean;
      hoaxProbability?: number;
      label?: string;
      model?: string;
    };
    if (!payload.available || typeof payload.hoaxProbability !== "number") return null;
    const probability = Math.min(1, Math.max(0, payload.hoaxProbability));
    return {
      probability,
      label: payload.label || "LABEL",
      model: payload.model || "indobert-local",
      version: `indobert-local:${payload.model || "faris27/indobert-hoax-detection"}`,
    };
  } catch {
    return null;
  }
}

export async function localIndoBertHealth(): Promise<"siap" | "mati"> {
  const url = endpoint();
  if (!url) return "mati";
  try {
    const health = new URL("/health", url);
    const response = await fetch(health, { signal: AbortSignal.timeout(600) });
    if (!response.ok) return "mati";
    const payload = (await response.json()) as { ready?: boolean };
    return payload.ready ? "siap" : "mati";
  } catch {
    return "mati";
  }
}
