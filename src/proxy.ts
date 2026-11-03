import { NextResponse, type NextRequest } from "next/server";
import { accessGate } from "@/lib/auth/gate";
import { openSession, SESSION_COOKIE, shouldExpireCookie } from "@/lib/auth/token";

const NO_STORE = "private, no-store, max-age=0, must-revalidate";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", NO_STORE);
  response.headers.set("Pragma", "no-cache");
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await openSession(request.cookies.get(SESSION_COOKIE)?.value);
  const supabaseOn = Boolean(
    process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
  const hasSupabaseCookie =
    supabaseOn &&
    request.cookies.getAll().some((cookie) => cookie.name !== SESSION_COOKIE && shouldExpireCookie(cookie.name));
  const authenticated = Boolean(session) || hasSupabaseCookie;
  const gate = accessGate(pathname, authenticated);
  if (gate === "home") return noStore(NextResponse.redirect(new URL("/", request.url)));
  if (gate === "login") return noStore(NextResponse.redirect(new URL("/login", request.url)));
  if (gate === "unauthorized") {
    return noStore(NextResponse.json({ error: "Tidak ada sesi analis." }, { status: 401 }));
  }
  return noStore(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
