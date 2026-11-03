import Link from "next/link";
import { currentSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

const links = [
  { href: "/", label: "Dasbor" },
  { href: "/analisis", label: "Analisis" },
  { href: "/ontologi", label: "Ontologi" },
  { href: "/audit", label: "Audit" },
];

export async function Shell({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-border bg-slate-950/80 md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 px-4 py-4 md:px-5">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-gold/50 text-gold" aria-hidden>
            ✶
          </span>
          <div>
            <p className="font-semibold tracking-tight">Kartika Sentinel</p>
            <p className="text-xs text-muted">Siber Sosial · TNI</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:px-3 md:pb-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-md px-3 py-2 text-sm text-foreground/90 hover:bg-white/5"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-8">
          <p className="text-sm text-muted">Pusat peringatan dini · human-in-the-loop</p>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">{session.email}</span>
            <span className="rounded-full border border-gold/40 px-2 py-0.5 text-xs uppercase text-gold">
              {session.role === "admin" ? "admin" : "analis"}
            </span>
            <form action="/api/auth/logout" method="post">
              <button className="text-muted underline-offset-2 hover:underline" type="submit">
                Keluar
              </button>
            </form>
          </div>
        </header>
        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
