import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseActions } from "@/components/case-actions";
import { CaseEvidence } from "@/components/case-evidence";
import { TermTip } from "@/components/term-tip";
import { glossaryTip } from "@/lib/glossary";
import { presentCase } from "@/lib/analyze/present";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { currentSession } from "@/lib/auth/session";
import { getCase } from "@/lib/db";
import { alertStatusLabel, caseStatusLabel, percent } from "@/lib/format";
import { ENGINE_DIVERGENCE, ENGINE_DIVERGENCE_WARNING } from "@/lib/model/classify";
import { hasHttpUrl } from "@/lib/factcheck/order";
import { displayHandle } from "@/lib/security/redact";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getCase(id);
  if (!detail) notFound();
  const session = await currentSession();
  const canEdit = Boolean(session && (session.role === "admin" || session.sub === detail.assignedTo));
  const report = presentCase(detail);
  const unscored = Boolean(detail.assessment.unscored?.reason);
  const gap = detail.assessment.indobert
    && Math.abs(detail.assessment.indobert.probability - detail.assessment.heuristic.probability) >= ENGINE_DIVERGENCE;
  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-muted hover:text-gold">Kembali ke dasbor</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{detail.demo ? "Data demo" : "Masukan analis"}</p>
          <h1 className="mt-1 inline-flex items-center text-2xl font-semibold">
            {report.headline}
            <TermTip {...glossaryTip("vonis-laporan")} />
          </h1>
          {report.confidence ? (
            <p className="mt-1 text-sm">
              Keyakinan: {report.confidence}
              {report.confidenceReason ? `. ${report.confidenceReason[0].toUpperCase()}${report.confidenceReason.slice(1)}.` : ""}
            </p>
          ) : null}
          <p className="mt-1 inline-flex items-center text-sm text-muted">
            {report.checkedLabel}
            <TermTip {...glossaryTip("dicek-pada")} />
          </p>
        </div>
        <span className="inline-flex items-center gap-1">
          <Badge className={
            report.badge.tone === "kritis" ? "border-danger text-danger"
              : report.badge.tone === "prioritas" || report.badge.tone === "dicek" ? "border-warning text-warning"
                : report.badge.tone === "aman" ? "border-info text-info"
                  : ""
          }>
            {report.badge.label}
          </Badge>
          <TermTip {...glossaryTip("badge-aksi")} />
        </span>
      </div>
      <p className="text-sm text-muted">Ini hanya saran. Keputusan tetap pada Anda. Angka bukan penetapan hoaks.</p>
      <CaseEvidence bullets={report.bullets} />
      <Card className="space-y-2 p-4">
        <h2 className="inline-flex items-center font-medium">
          Ringkasan
          <TermTip {...glossaryTip("ringkasan-laporan")} />
        </h2>
        {report.sentences.map((sentence) => (
          <p key={sentence} className="text-sm leading-6">{sentence}</p>
        ))}
      </Card>
      {report.scores ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="p-4">
            <p className="flex items-center text-xs text-muted">
              Skor utama · {report.scores.utamaBand}
              <TermTip {...glossaryTip("skor-utama")} />
            </p>
            <p className="mt-1 text-sm leading-6">{report.scores.utama}</p>
          </Card>
          <Card className="p-4">
            <p className="flex items-center text-xs text-muted">
              Sensitivitas · {report.scores.sensitivitasBand}
              <TermTip {...glossaryTip("sensitivitas")} />
            </p>
            <p className="mt-1 text-sm leading-6">{report.scores.sensitivitas}</p>
          </Card>
          <Card className="p-4">
            <p className="flex items-center text-xs text-muted">
              Viralitas · {report.scores.viralitasBand}
              <TermTip {...glossaryTip("viralitas")} />
            </p>
            <p className="mt-1 text-sm leading-6">{report.scores.viralitas}</p>
          </Card>
        </div>
      ) : (
        <Card className="border-warning/50 p-4 text-sm">
          <p className="font-medium">Belum bisa dinilai</p>
          <p className="mt-1">{detail.assessment.unscored?.reason}</p>
          <p className="mt-1 text-muted">{detail.assessment.unscored?.nextStep}</p>
        </Card>
      )}
      <p className="inline-flex items-center text-sm">
        {report.topicLine}
        <TermTip {...glossaryTip("topik-berkas")} />
      </p>
      {detail.assessment.caution?.warning ? (
        <p className="text-sm text-warning">Teks pendek.</p>
      ) : null}
      {!unscored && detail.modelStatus !== "siap" ? (
        <p className="text-sm text-muted">Penilai utama belum tersambung. Angka ini dari cadangan.</p>
      ) : null}
      <Card className="space-y-3 p-4">
        <h2 className="font-medium">Teks yang dinilai</h2>
        {detail.assessment.youtube?.note ? (
          <p className="inline-flex items-center text-sm">
            {detail.assessment.youtube.note}
            <TermTip {...glossaryTip("bagian-video")} />
          </p>
        ) : null}
        {detail.platform === "gambar" && !unscored ? (
          <p className="text-sm text-muted">Yang dinilai adalah keterangan yang ditempel analis, bukan piksel gambar.</p>
        ) : null}
        <p className="whitespace-pre-wrap text-sm leading-6">{detail.text}</p>
        <p className="text-xs text-muted">Pegangan: {displayHandle(detail.authorHash)} · {detail.platform}</p>
        {detail.sourceUrl && hasHttpUrl(detail.sourceUrl) ? (
          <a href={detail.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-sm text-info underline-offset-2 hover:underline">
            {detail.sourceUrl}
          </a>
        ) : null}
      </Card>
      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-xs text-info">Detail teknis</summary>
        <div className="mt-3 space-y-2 text-sm">
          <p>Penilai: {unscored ? "tidak dijalankan" : "penilaian otomatis"}</p>
          {report.viralitasNote ? <p className="text-muted">{report.viralitasNote}</p> : null}
          {detail.assessment.indobert ? (
            <p>Penilai utama: {percent(detail.assessment.indobert.probability)}</p>
          ) : (
            <p className="text-muted">Penilai utama tidak dipakai pada skor ini.</p>
          )}
          {detail.assessment.linear ? <p>Penilai cadangan: {percent(detail.assessment.linear.probability)}</p> : null}
          {gap ? <p className="text-warning">{ENGINE_DIVERGENCE_WARNING}</p> : null}
          <p>Media AI: {detail.ai.flagged ? "Indikasi" : "Tidak menonjol"} · {detail.ai.confidence} · {percent(detail.ai.score)}</p>
          <p className="text-muted">{detail.ai.disclaimer}</p>
          <ul className="list-disc pl-5 text-muted">
            {(detail.assessment.heuristic?.reasons ?? []).map((reason: string) => <li key={reason}>{reason}</li>)}
          </ul>
        </div>
      </details>
      <Card className="space-y-3 p-4">
        <h2 className="font-medium">Tindakan analis</h2>
        <p className="text-sm">{detail.recommendation}</p>
        <p className="text-sm text-muted">
          Peringatan: {alertStatusLabel(detail.alertStatus)}
          {detail.caseStatus ? ` · Kasus: ${caseStatusLabel(detail.caseStatus)}` : ""}
        </p>
        <CaseActions
          alertId={detail.alertId}
          alertStatus={detail.alertStatus}
          caseStatus={detail.caseStatus}
          canEdit={canEdit}
          initialNote={detail.analystNote ?? ""}
          tips={{
            baru: glossaryTip("baru"),
            "triase-tombol": glossaryTip("triase-tombol"),
            "eskalasi-tombol": glossaryTip("eskalasi-tombol"),
            "tutup-peringatan": glossaryTip("tutup-peringatan"),
            "buka-kasus": glossaryTip("buka-kasus"),
            "kasus-terbuka": glossaryTip("kasus-terbuka"),
            diselidiki: glossaryTip("diselidiki"),
            "tutup-kasus": glossaryTip("tutup-kasus"),
            "skor-ulang": glossaryTip("skor-ulang"),
            "unduh-pdf": glossaryTip("unduh-pdf"),
            catatan: glossaryTip("catatan"),
          }}
        />
      </Card>
      <Card className="space-y-2 p-4">
        <h2 className="inline-flex items-center font-medium">Linimasa <TermTip {...glossaryTip("linimasa")} /></h2>
        {detail.timeline.length === 0 ? <p className="text-sm text-muted">Belum ada jejak waktu.</p> : (
          <ol className="space-y-2 text-sm">
            {detail.timeline.map((event) => (
              <li key={`${event.at}-${event.label}`} className="border-l border-gold/40 pl-3">
                <span className="text-muted">{event.at}</span> · {event.label}
                <p className="text-muted">{event.detail}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
