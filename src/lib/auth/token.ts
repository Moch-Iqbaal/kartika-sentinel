export type Role = "analyst" | "admin";

export type Session = {
  sub: string;
  email: string;
  role: Role;
  exp: number;
};

export const SESSION_COOKIE = "ks_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

export function sessionSecret(): string | null {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (process.env.NODE_ENV === "production") return null;
  return "dev-only-session-secret-kartika-sentinel";
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

function timingSafeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function sealSession(session: Omit<Session, "exp">): Promise<string | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  const body: Session = { ...session, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS };
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(body)));
  const signature = await sign(payload, secret);
  return `${payload}.${signature}`;
}

export async function openSession(token: string | undefined | null): Promise<Session | null> {
  const secret = sessionSecret();
  if (!secret || !token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = await sign(payload, secret);
  if (!timingSafeEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Session;
    if (!parsed.sub || !parsed.email || (parsed.role !== "analyst" && parsed.role !== "admin")) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(): {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true" || (process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production"),
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

/** Cookie Supabase atau sesi aplikasi yang harus dihapus saat keluar. */
export function shouldExpireCookie(name: string): boolean {
  return name === SESSION_COOKIE || name.startsWith("sb-") || name.includes("auth-token");
}

/**
 * Atribut penghapus harus sama dengan saat cookie dipasang (path, secure, httpOnly).
 * Sesi aplikasi memakai httpOnly + secure di production.
 * Cookie Supabase dari @supabase/ssr default-nya bukan httpOnly dan bukan secure,
 * jadi penghapusnya ikut atribut itu. Max-Age 0 saja tidak cukup di beberapa runtime;
 * Expires masa lalu ikut dikirim.
 */
export function cookiesToExpire(names: string[]): Array<{
  name: string;
  value: "";
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: 0;
  expires: Date;
}> {
  const app = sessionCookieOptions();
  const unique = [...new Set(names.filter(shouldExpireCookie))];
  if (!unique.includes(SESSION_COOKIE)) unique.push(SESSION_COOKIE);
  const expires = new Date(0);
  return unique.map((name) => {
    const appSession = name === SESSION_COOKIE;
    return {
      name,
      value: "",
      httpOnly: appSession ? app.httpOnly : false,
      sameSite: "lax",
      secure: appSession ? app.secure : false,
      path: "/",
      maxAge: 0,
      expires,
    };
  });
}
