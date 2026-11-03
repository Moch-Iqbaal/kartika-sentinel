import { createHash } from "node:crypto";

/**
 * Menyembunyikan data pribadi sebelum teks disimpan atau ditampilkan.
 * Pola ini sengaja agresif: lebih baik menyamarkan angka yang mirip NIK
 * daripada menampilkan 16 digit utuh di dasbor.
 */

const PHONE = /(?:\+62|62|0)\s?8\d{2}(?:[\s.-]?\d){7,11}/g;
const NIK = /(?<!\d)\d{16}(?!\d)/g;
const STREET =
  /\b(?:jl\.?|jalan|gg\.?|gang)\s+[A-Za-z0-9][A-Za-z0-9.'-]{1,24}(?:\s+[A-Za-z0-9][A-Za-z0-9.'-]{1,24}){0,3}(?:\s+no\.?\s*\d{1,4})?/gi;
const RT_RW = /\brt\.?\s*\d{1,3}\s*[,/]?\s*rw\.?\s*\d{1,3}\b/gi;
const HANDLE_MENTION = /@[A-Za-z0-9_]{2,30}/g;

export function redactSensitive(input: string): string {
  return input
    .replace(PHONE, "[nomor disamarkan]")
    .replace(NIK, "[nik disamarkan]")
    .replace(STREET, "[alamat disamarkan]")
    .replace(RT_RW, "[alamat disamarkan]")
    .replace(HANDLE_MENTION, "@redaksi");
}

function handleSalt(): string | null {
  const fromEnv = process.env.HANDLE_HASH_SALT?.trim();
  if (fromEnv && fromEnv.length >= 8) return fromEnv;
  if (process.env.NODE_ENV === "production") return null;
  return "dev-handle-salt";
}

/** Hash satu arah. Pegangan mentah tidak disimpan. */
export function hashHandle(handle: string | null | undefined): string | null {
  const clean = handle?.trim().toLowerCase();
  if (!clean) return null;
  const salt = handleSalt();
  if (!salt) return null;
  return createHash("sha256").update(`${salt}\0${clean}`).digest("hex");
}

export function displayHandle(hash: string | null | undefined): string {
  if (!hash) return "tanpa pegangan";
  return `sid:${hash.slice(0, 10)}`;
}
