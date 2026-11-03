/** Keputusan proxy: siapa yang boleh lewat, dan siapa yang dikembalikan ke /login. */
export type AccessGate = "allow" | "login" | "home" | "unauthorized";

export function accessGate(pathname: string, authenticated: boolean): AccessGate {
  if (
    pathname === "/api/auth/login"
    || pathname === "/api/auth/logout"
    || pathname === "/api/health"
    || pathname === "/api/model/register"
  ) {
    return "allow";
  }
  if (pathname === "/login") return authenticated ? "home" : "allow";
  if (!authenticated) return pathname.startsWith("/api/") ? "unauthorized" : "login";
  return "allow";
}
