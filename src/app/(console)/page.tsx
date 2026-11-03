import Link from "next/link";
import { Disclaimer } from "@/components/disclaimer";
import { ViralityChart } from "@/components/virality-chart";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { displayHandle } from "@/lib/security/redact";
import { listAlerts, topicCounts, velocitySeries } from "@/lib/db/store";
import { localIndoBertHealth } from "@/lib/model/local-indobert";
import { TOPICS } from "@/lib/ontology/topics";
import { alertStatusLabel, bandLabel, percent } from "@/lib/format";
import { riskBand } from "@/lib/scoring/risk";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ topik?: string; pita?: string }>;
}) {
  const params = await searchParams;
  const [alerts, series, counts, model] = await Promise.all([
    Promise.resolve(listAlerts()),
    Promise.resolve(velocitySeries()),
    Promise.resolve(topicCounts()),
    localIndoBertHealth(),
  ]);
  const filtered = alerts.filter((alert) => {
    if (params.topik && !alert.topicTags.includes(params.topik)) return false;
    if (params.pita && riskBand(alert.riskScore) !== params.pita) return false;
    return true;
  });
  const critical = alerts.filter((alert) => alert.band === "kritis").length;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dasbor peringatan</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Umpan di bawah ini data demo sintetis, bukan unggahan akun sungguhan. Pegangan akun disimpan sebagai hash.
          Peringkat memakai hoaks × sensitivitas topik × viralitas efektif.
        </p>
      </div>
      <Disclaimer modelReady={model === "siap" ? "siap" : "tidak tersambung, dasbor memakai model linier"} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase text-muted">Peringatan</p>
          <p className="mt-1 text-2xl font-semibold">{alerts.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted">Pita kritis</p>
          <p className="mt-1 text-2xl font-semibold text-danger">{critical}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted">IndoBERT lokal</p>
          <p className="mt-1 text-2xl font-semibold">{model === "siap" ? "Siap" : "Cadangan"}</p>
        </Card>
      </div>
      <Card className="p-4">
        <h2 className="text-sm font-medium">Kecepatan sebaran demo</h2>
        <p className="mb-3 text-xs text-muted">Sumbu X adalah urutan pengamatan. Garis adalah jumlah sebar pada empat peringatan teratas.</p>
        <ViralityChart series={series} />
      </Card>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link className="rounded-full border border-border px-3 py-1" href="/">Semua</Link>
        {TOPICS.map((topic) => (
          <Link key={topic.id} className="rounded-full border border-border px-3 py-1" href={`/?topik=${topic.id}`}>
            {topic.label} ({counts[topic.id] ?? 0})
          </Link>
        ))}
        <Link className="rounded-full border border-border px-3 py-1" href="/?pita=kritis">Kritis</Link>
        <Link className="rounded-full border border-border px-3 py-1" href="/?pita=prioritas">Prioritas</Link>
        <Link className="rounded-full border border-border px-3 py-1" href="/?pita=pantau">Pantau</Link>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-950/50 text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2">Risiko</th>
              <th className="px-3 py-2">Pita</th>
              <th className="px-3 py-2">Narasi</th>
              <th className="px-3 py-2">Topik</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Pegangan</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted" colSpan={6}>Tidak ada peringatan pada saringan ini.</td>
              </tr>
            ) : filtered.map((alert) => (
              <tr key={alert.id} className="border-t border-border">
                <td className="px-3 py-3 font-mono">{percent(alert.riskScore)}</td>
                <td className="px-3 py-3">
                  <Badge className={alert.band === "kritis" ? "border-danger text-danger" : alert.band === "prioritas" ? "border-warning text-warning" : ""}>
                    {bandLabel(alert.band)}
                  </Badge>
                </td>
                <td className="max-w-md px-3 py-3">
                  <Link href={`/kasus/${alert.id}`} className="hover:text-gold">{alert.excerpt}</Link>
                  {alert.demo ? <span className="mt-1 block text-xs text-muted">Data demo</span> : null}
                </td>
                <td className="px-3 py-3 text-muted">{alert.topicTags.join(", ") || "—"}</td>
                <td className="px-3 py-3">{alertStatusLabel(alert.status)}</td>
                <td className="px-3 py-3 font-mono text-xs">{displayHandle(alert.authorHash)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
