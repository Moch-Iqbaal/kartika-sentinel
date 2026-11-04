import Link from "next/link";
import { Disclaimer } from "@/components/disclaimer";
import { TermTip } from "@/components/term-tip";
import { ViralityChart } from "@/components/virality-chart";
import { glossaryTip } from "@/lib/glossary";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { displayHandle } from "@/lib/security/redact";
import { listAlerts, topicCounts, velocitySeries } from "@/lib/db";
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
  let alerts: Awaited<ReturnType<typeof listAlerts>> = [];
  let series: Awaited<ReturnType<typeof velocitySeries>> = [];
  let counts: Record<string, number> = {};
  let loadError = "";
  let model: Awaited<ReturnType<typeof localIndoBertHealth>> = "mati";
  try {
    [alerts, series, counts, model] = await Promise.all([
      listAlerts(),
      velocitySeries(),
      topicCounts(),
      localIndoBertHealth(),
    ]);
  } catch {
    loadError = "Dasbor gagal memuat data. Periksa koneksi basis data, lalu muat ulang.";
  }
  const filtered = alerts.filter((alert) => {
    if (params.topik && !alert.topicTags.includes(params.topik)) return false;
    if (params.pita && (alert.unscored || riskBand(alert.riskScore) !== params.pita)) return false;
    return true;
  });
  const critical = alerts.filter((alert) => !alert.unscored && alert.band === "kritis").length;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dasbor peringatan</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Daftar di bawah ini contoh latihan, bukan unggahan sungguhan.
          Urutan mengikuti kemiripan hoaks, kerawanan topik, dan sebaran.
        </p>
      </div>
      <Disclaimer />
      {model === "ringan" ? (
        <Card className="p-4 text-sm">
          Penilai utama belum disambungkan. Angka memakai cadangan.
        </Card>
      ) : null}
      {model === "bangun" ? (
        <Card className="border-warning/50 p-4 text-sm">
          Penilai utama masih menyala. Angka sementara memakai cadangan.
        </Card>
      ) : null}
      {model === "siap" ? (
        <Card className="border-ok/40 p-4 text-sm">Penilai utama tersambung.</Card>
      ) : null}
      {model === "offline" || model === "mati" ? (
        <Card className="p-4 text-sm text-muted">Penilai utama tidak menjawab. Angka memakai cadangan.</Card>
      ) : null}
      {loadError ? <Card className="border-danger/50 p-4 text-sm text-danger">{loadError}</Card> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase text-muted">Peringatan</p>
          <p className="mt-1 text-2xl font-semibold">{alerts.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted">Segera ditinjau</p>
          <p className="mt-1 text-2xl font-semibold text-danger">{critical}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted">Penilai</p>
          <p className="mt-1 text-lg font-semibold">{model === "siap" ? "Utama aktif" : model === "bangun" ? "Utama menyala" : model === "mati" || model === "offline" ? "Utama mati" : "Cadangan"}</p>
        </Card>
      </div>
      <Card className="p-4">
        <h2 className="text-sm font-medium">Kecepatan sebaran demo</h2>
        <p className="mb-3 text-xs text-muted">Sumbu X adalah urutan pengamatan. Garis adalah jumlah sebar pada empat peringatan teratas.</p>
        <ViralityChart series={series} />
      </Card>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="inline-flex items-center rounded-full border border-border pl-3">
          <Link className="py-1" href="/">Semua</Link>
          <span className="pr-2"><TermTip {...glossaryTip("semua")} /></span>
        </span>
        {TOPICS.map((topic) => (
          <span key={topic.id} className="inline-flex items-center rounded-full border border-border pl-3">
            <Link className="py-1" href={`/?topik=${topic.id}`}>
              {topic.label} ({counts[topic.id] ?? 0})
            </Link>
            <span className="pr-2"><TermTip {...glossaryTip(`topik-${topic.id}`)} /></span>
          </span>
        ))}
        <span className="inline-flex items-center rounded-full border border-border pl-3">
          <Link className="py-1" href="/?pita=kritis">Kritis</Link>
          <span className="pr-2"><TermTip {...glossaryTip("kritis")} /></span>
        </span>
        <span className="inline-flex items-center rounded-full border border-border pl-3">
          <Link className="py-1" href="/?pita=prioritas">Prioritas</Link>
          <span className="pr-2"><TermTip {...glossaryTip("prioritas")} /></span>
        </span>
        <span className="inline-flex items-center rounded-full border border-border pl-3">
          <Link className="py-1" href="/?pita=pantau">Pantau</Link>
          <span className="pr-2"><TermTip {...glossaryTip("pantau")} /></span>
        </span>
      </div>
      {filtered.length === 0 && !loadError ? (
        <Card className="p-6 text-sm text-muted">
          {alerts.length === 0
            ? "Belum ada peringatan. Buka Analisis untuk menempel teks, URL, atau tautan gambar."
            : "Tidak ada peringatan pada saringan ini. Pilih Semua untuk melihat antrean."}
        </Card>
      ) : null}
      <div className="grid gap-3 md:hidden">
        {filtered.map((alert) => (
          <Link key={alert.id} href={`/kasus/${alert.id}`} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm">{alert.unscored ? "Belum bisa dinilai" : percent(alert.riskScore)}</span>
              <Badge className={
                alert.unscored ? ""
                  : alert.band === "kritis" ? "border-danger text-danger"
                    : alert.band === "prioritas" ? "border-warning text-warning"
                      : "border-info text-info"
              }>
                {alert.unscored ? "Belum bisa dinilai" : (alert.verdictLabel || bandLabel(alert.band))}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-6">{alert.excerpt}</p>
            <p className="mt-2 text-xs text-muted">{alert.demo ? "Data demo · " : ""}{displayHandle(alert.authorHash)}</p>
          </Link>
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-950/50 text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2"><span className="inline-flex items-center">Risiko <TermTip {...glossaryTip("risiko-kolom")} /></span></th>
              <th className="px-3 py-2"><span className="inline-flex items-center">Pita <TermTip {...glossaryTip("pita")} /></span></th>
              <th className="px-3 py-2"><span className="inline-flex items-center">Narasi <TermTip {...glossaryTip("narasi")} /></span></th>
              <th className="px-3 py-2"><span className="inline-flex items-center">Topik <TermTip {...glossaryTip("topik-kolom")} /></span></th>
              <th className="px-3 py-2"><span className="inline-flex items-center">Status <TermTip {...glossaryTip("status-kolom")} /></span></th>
              <th className="px-3 py-2"><span className="inline-flex items-center">Pegangan <TermTip {...glossaryTip("pegangan")} /></span></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted" colSpan={6}>Tidak ada peringatan pada saringan ini.</td>
              </tr>
            ) : filtered.map((alert) => (
              <tr key={alert.id} className="border-t border-border">
                <td className="px-3 py-3 font-mono">{alert.unscored ? "Belum bisa dinilai" : percent(alert.riskScore)}</td>
                <td className="px-3 py-3">
                  <Badge className={
                    alert.unscored ? ""
                      : alert.band === "kritis" ? "border-danger text-danger"
                        : alert.band === "prioritas" ? "border-warning text-warning"
                          : "border-info text-info"
                  }>
                    {alert.unscored ? "Belum bisa dinilai" : (alert.verdictLabel || bandLabel(alert.band))}
                  </Badge>
                  {!alert.unscored && alert.badgeLabel ? (
                    <span className="mt-1 block text-xs text-muted">{alert.badgeLabel}</span>
                  ) : null}
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
