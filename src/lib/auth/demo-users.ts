import { createHash, timingSafeEqual } from "node:crypto";
import type { Role } from "@/lib/auth/token";

export const DEMO_ANALYST_ID = "11111111-1111-4111-8111-111111111111";
export const DEMO_ADMIN_ID = "22222222-2222-4222-8222-222222222222";

export type DemoAccount = {
  id: string;
  email: string;
  password: string;
  role: Role;
};

function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Akun demo hanya hidup di development, atau di production bila DEMO_MODE=true
 * dan sandi diisi lewat environment. Sandi bawaan tidak dipakai di production.
 * Jika Supabase dikonfigurasi, akun demo dimatikan kecuali DEMO_MODE=true.
 */
export function demoAccounts(): DemoAccount[] {
  const production = process.env.NODE_ENV === "production";
  const explicitDemo = process.env.DEMO_MODE === "true";
  if (production && !explicitDemo) return [];
  if (supabaseConfigured() && !explicitDemo) return [];

  const analystEmail = process.env.DEMO_ANALYST_EMAIL?.trim() || (production ? "" : "analis@kartika.local");
  const analystPassword = process.env.DEMO_ANALYST_PASSWORD || (production ? "" : "demo-analis");
  const adminEmail = process.env.DEMO_ADMIN_EMAIL?.trim() || (production ? "" : "admin@kartika.local");
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD || (production ? "" : "demo-admin");

  const accounts: DemoAccount[] = [];
  if (analystEmail && analystPassword) {
    accounts.push({ id: DEMO_ANALYST_ID, email: analystEmail, password: analystPassword, role: "analyst" });
  }
  if (adminEmail && adminPassword) {
    accounts.push({ id: DEMO_ADMIN_ID, email: adminEmail, password: adminPassword, role: "admin" });
  }
  return accounts;
}

export function matchDemoAccount(email: string, password: string): DemoAccount | null {
  const account = demoAccounts().find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
  if (!account) return null;
  const left = createHash("sha256").update(account.password).digest();
  const right = createHash("sha256").update(password).digest();
  if (!timingSafeEqual(left, right)) return null;
  return account;
}

export function demoHints(): Array<{ email: string; password: string; role: Role }> {
  if (process.env.NODE_ENV === "production") return [];
  return demoAccounts().map((account) => ({
    email: account.email,
    password: account.password,
    role: account.role,
  }));
}
