/**
 * Teks pengguna adalah data, bukan instruksi.
 * Pengklasifikasi lokal tidak punya tool-calling. Fungsi ini hanya membuang
 * karakter kendali dan memotong panjang sebelum teks masuk ke model.
 */
export function sanitizeUntrusted(input: string): string {
  return input
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .trim()
    .slice(0, 6000);
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("host");
  if (!host) throw new Error("Host hilang.");
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new Error("Origin tidak valid.");
  }
  if (originHost !== host) {
    throw new Error("Origin tidak sama dengan host.");
  }
}
