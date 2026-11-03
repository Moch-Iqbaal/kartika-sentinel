import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { demoAccounts } from "@/lib/auth/demo-users";
import { openSession, SESSION_COOKIE, type Role, type Session } from "@/lib/auth/token";

export async function readDemoSession(): Promise<Session | null> {
  const jar = await cookies();
  return openSession(jar.get(SESSION_COOKIE)?.value);
}

async function roleForSupabaseUser(userId: string, email: string): Promise<Role | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.from("analysts").select("role").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  if (data.role !== "analyst" && data.role !== "admin") return null;
  void email;
  return data.role;
}

export async function readSupabaseSession(): Promise<Session | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const jar = await cookies();
  const { createServerClient } = await import("@supabase/ssr");
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: () => {
        /* pembaruan cookie terjadi di route login, bukan di pembacaan */
      },
    },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const role = await roleForSupabaseUser(data.user.id, data.user.email || "");
  if (!role) return null;
  return {
    sub: data.user.id,
    email: data.user.email || "",
    role,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
}

export async function currentSession(): Promise<Session | null> {
  const demo = await readDemoSession();
  if (demo) return demo;
  return readSupabaseSession();
}

export function knownAnalystIds(): string[] {
  return demoAccounts().map((account) => account.id);
}
