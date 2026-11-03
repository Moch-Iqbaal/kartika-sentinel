import { NextResponse, type NextRequest } from "next/server";
import { openSession, SESSION_COOKIE } from "@/lib/auth/token";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/api/auth/login" || pathname === "/api/auth/logout" || pathname === "/api/health") {
    return NextResponse.next();
  }
  const session = await openSession(request.cookies.get(SESSION_COOKIE)?.value);
  const supabaseOn = Boolean(
    process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
  const hasSupabaseCookie =
    supabaseOn && request.cookies.getAll().some((cookie) => cookie.name.includes("auth-token"));
  if (pathname === "/login") {
    if (session) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }
  if (!session && !hasSupabaseCookie) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Tidak ada sesi analis." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
