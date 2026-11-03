import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { demoHints } from "@/lib/auth/demo-users";
import { currentSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentSession()) redirect("/");
  const hints = demoHints();
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <p className="text-xs uppercase tracking-[0.2em] text-gold">Kartika Cyber Hackathon 2026</p>
      <h1 className="mt-2 text-3xl font-semibold">Kartika Sentinel</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Meja triase untuk analis siber militer. Sistem menghitung indikasi hoaks, topik narasi, dan padanan cek fakta. Ia tidak menjatuhkan putusan.
      </p>
      <Card className="mt-6 p-5">
        <LoginForm />
        {hints.length > 0 ? (
          <div className="mt-4 border-t border-border pt-4 text-sm text-muted">
            <p>Mode demo lokal. Sandi ini bukan rahasia produksi.</p>
            <ul className="mt-2 space-y-1 font-mono text-xs">
              {hints.map((hint) => (
                <li key={hint.email}>
                  {hint.role === "admin" ? "Admin" : "Analis"}: {hint.email} / {hint.password}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </main>
  );
}
