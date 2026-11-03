import { createHash } from "node:crypto";

/** UUID versi 5 tiruan yang stabil, supaya id teks korpus muat di kolom uuid Postgres. */
export function stableUuid(name: string): string {
  const hash = createHash("sha256").update(`kartika-sentinel:${name}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
