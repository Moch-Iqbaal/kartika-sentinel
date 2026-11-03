type Bucket = { resetAt: number; count: number };

const buckets = new Map<string, Bucket>();

/** Pembatas sederhana di memori proses. Cukup untuk satu server demo. */
export function rateLimit(
  key: string,
  limit = 15,
  windowMs = 10 * 60 * 1000,
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now >= current.resetAt) {
    buckets.set(key, { resetAt: now + windowMs, count: 1 });
    return { ok: true, retryAfter: 0 };
  }
  if (current.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { ok: true, retryAfter: 0 };
}
