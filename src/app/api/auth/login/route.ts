import { NextResponse } from "next/server";
import { matchDemoAccount } from "@/lib/auth/demo-users";
import { sealSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/token";
import { rateLimit } from "@/lib/security/rate-limit";
import { assertSameOrigin } from "@/lib/security/untrusted";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Origin ditolak." }, { status: 403 });
  }
  const limit = rateLimit(`login:${request.headers.get("x-forwarded-for") ?? "local"}`, 20, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Terlalu banyak percobaan." }, { status: 429, headers: { "retry-after": String(limit.retryAfter) } });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 8_000) return NextResponse.json({ error: "Badan permintaan terlalu besar." }, { status: 413 });
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = body?.email?.trim() ?? "";
  const password = body?.password ?? "";
  if (!email || !password) return NextResponse.json({ error: "Surel dan sandi wajib." }, { status: 400 });

  const account = matchDemoAccount(email, password);
  if (account) {
    const token = await sealSession({ sub: account.id, email: account.email, role: account.role });
    if (!token) return NextResponse.json({ error: "SESSION_SECRET belum diatur." }, { status: 503 });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    const { createServerClient } = await import("@supabase/ssr");
    const response = NextResponse.json({ ok: true });
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return [];
        },
        setAll(cookies) {
          for (const cookie of cookies) response.cookies.set(cookie.name, cookie.value, cookie.options);
        },
      },
    });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return response;
  }
  return NextResponse.json({ error: "Masuk ditolak." }, { status: 401 });
}
