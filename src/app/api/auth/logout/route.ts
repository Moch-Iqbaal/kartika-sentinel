import { NextResponse, type NextRequest } from "next/server";
import { cookiesToExpire, shouldExpireCookie } from "@/lib/auth/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = "private, no-store, max-age=0, must-revalidate";

/**
 * Keluar harus POST. Cookie sesi aplikasi dan cookie Supabase dihapus
 * dengan atribut yang sama seperti saat dipasang, lalu browser diarahkan ke /login.
 */
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.headers.set("Cache-Control", NO_STORE);
  response.headers.set("Pragma", "no-cache");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (url && anon) {
    try {
      const { createServerClient } = await import("@supabase/ssr");
      const supabase = createServerClient(url, anon, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(list) {
            for (const cookie of list) {
              const options = { ...cookie.options };
              if (options.maxAge === 0 && !options.expires) options.expires = new Date(0);
              response.cookies.set(cookie.name, cookie.value, options);
            }
          },
        },
      });
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Cookie tetap dihapus di bawah meski klien Supabase gagal.
    }
  }

  const names = request.cookies.getAll().map((cookie) => cookie.name).filter(shouldExpireCookie);
  for (const cookie of cookiesToExpire(names)) {
    response.cookies.set(cookie);
  }
  return response;
}
