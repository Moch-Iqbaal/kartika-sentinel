import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseActions } from "@/components/case-actions";
import { CaseEvidence } from "@/components/case-evidence";
import { TermTip } from "@/components/term-tip";
import { confidenceSentence, CONFIDENCE_LABEL, decideConfidence } from "@/lib/analyze/confidence";
import { ringkasanFromCase } from "@/lib/analyze/ringkasan";
import { glossaryTip } from "@/lib/glossary";
import { Disclaimer } from "@/components/disclaimer";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { currentSession } from "@/lib/auth/session";
import { getCase } from "@/lib/db";
import { alertStatusLabel, bandLabel, caseStatusLabel, engineLabel, modelModeLabel, percent } from "@/lib/format";
import { ENGINE_DIVERGENCE, ENGINE_DIVERGENCE_WARNING } from "@/lib/model/classify";
import { hasHttpUrl } from "@/lib/factcheck/order";
import { displayHandle } from "@/lib/security/redact";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getCase(id);
  if (!detail) notFound();
  const session = await currentSession();
  const canEdit = Boolean(session && (session.role === "admin" || session.sub === detail.assignedTo));
  const ringkasan = ringkasanFromCase(detail);
  const unscored = Boolean(detail.assessment.unscored?.reason);
  const confidence = unscored ? null : decideConfidence({
    textChars: detail.assessment.caution?.bodyChars ?? detail.text.trim().length,
    shortText: Boolean(detail.assessment.caution?.warning),
    indobert: detail.assessment.indobert?.probability ?? null,
    linear: detail.assessment.linear?.probability ?? null,
    matchCount: detail.matches.length,
    externalCount: detail.external.length,
  });
  const gap = detail.assessment.indobert
    && Math.abs(detail.assessment.indobert.probability - detail.assessment.heuristic.probability) >= ENGINE_DIVERGENCE;
  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-muted hover:text-gold">Kembali ke dasbor</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{detail.demo ? "Data demo" : "Masukan analis"}</p>
          <h1 className="mt-1 text-2xl font-semibold">Berkas peringatan</h1>
        </div>
        <Badge className={!unscored && detail.band === "kritis" ? "border-danger text-danger" : ""}>
          {unscored ? "Belum bisa dinilai" : `${bandLabel(detail.band)} · ${percent(detail.riskScore)}`}
        </Badge>
      </div>
      <Disclaimer mode={modelModeLabel(detail.modelStatus)} />
      {unscored ? (
        <Card className="border-warning/50 p-4 text-sm">
          <p className="font-medium">Belum bisa dinilai</p>
          <p className="mt-1">{detail.assessment.unscored?.reason}</p>
          <p className="mt-1 text-muted">{detail.assessment.unscored?.nextStep}</p>
        </Card>
      ) : null}
      {detail.assessment.caution?.warning ? (
        <Card className="border-warning/50 p-4 text-sm">
          <p className="font-medium text-warning">{detail.assessment.caution.warning}</p>
          <p className="mt-1">
            Tubuh artikel yang terbaca {detail.assessment.caution.bodyChars} karakter, di bawah ambang 200.
            Skor utama ditarik mendekati 50% dari keluaran mentah {percent(detail.assessment.caution.rawProbability)} karena teks sependek itu tidak cukup untuk menilai hoaks.
          </p>
        </Card>
      ) : null}
      {!unscored && (detail.modelStatus === "ringan" || detail.modelStatus === "dilewati") ? (
        <Card className="p-4 text-sm">mode ringan. Skor ini dari model n-gram dan heuristik, tanpa panggilan IndoBERT.</Card>
      ) : null}
      {detail.modelStatus === "bangun" ? (
        <Card className="border-warning/50 p-4 text-sm">IndoBERT on-premise sedang bangun. Skor tersimpan memakai model n-gram. Skor ulang setelah tunnel dan proses di Mac siap.</Card>
      ) : null}
      {detail.modelStatus === "mati" ? (
        <Card className="p-4 text-sm text-muted">IndoBERT on-premise tidak menjawab. Skor memakai model n-gram atau heuristik di server web.</Card>
      ) : null}
      <CaseEvidence detail={detail} />
      {confidence ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-gold/40 p-4">
          <div>
            <p className="flex items-center text-xs uppercase text-muted">Keyakinan hasil <TermTip {...glossaryTip("keyakinan-hasil")} /></p>
            <p className="text-3xl font-semibold">{CONFIDENCE_LABEL[confidence.level]}</p>
          </div>
          <p className="max-w-xl text-sm leading-6">{confidenceSentence(confidence)}</p>
        </Card>
      ) : null}
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="flex items-center text-xs text-muted">Skor utama <TermTip {...glossaryTip("skor-utama")} /></p>
          <p className="text-xl font-semibold">{unscored ? "—" : percent(detail.hoaxScore)}</p>
          <p className="text-xs text-muted">{unscored ? "Tidak dihitung" : engineLabel(detail.engine)}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center text-xs text-muted">Sensitivitas <TermTip {...glossaryTip("sensitivitas")} /></p>
          <p className="text-xl font-semibold">{unscored ? "—" : percent(detail.sensitivity)}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center text-xs text-muted">Viralitas <TermTip {...glossaryTip("viralitas")} /></p>
          <p className="text-xl font-semibold">{unscored ? "—" : percent(detail.virality)}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center text-xs text-muted">Media AI <TermTip {...glossaryTip("media-ai")} /></p>
          <p className="text-xl font-semibold">{detail.ai.flagged ? "Indikasi" : "Tidak menonjol"}</p>
          <p className="text-xs text-muted">{percent(detail.ai.score)}</p>
        </Card>
      </div>
      <Card className="space-y-3 p-4">
        <h2 className="font-medium">Teks yang dinilai</h2>
        {detail.platform === "gambar" && !unscored ? (
          <p className="text-sm text-muted">Yang dinilai adalah keterangan yang ditempel analis, bukan piksel atau metadata gambar.</p>
        ) : null}
        <p className="whitespace-pre-wrap text-sm leading-6">{detail.text}</p>
        <p className="text-xs text-muted">Pegangan: {displayHandle(detail.authorHash)} · {detail.platform}</p>
        {detail.sourceUrl && hasHttpUrl(detail.sourceUrl) ? (
          <a href={detail.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-sm text-info underline-offset-2 hover:underline">
            {detail.sourceUrl}
          </a>
        ) : null}
      </Card>
      <Card className="space-y-2 p-4">
        <h2 className="font-medium">Mesin skor</h2>
        {unscored ? <p className="text-sm">Tidak ada skor. Mesin tidak dijalankan pada metadata gambar.</p> : (
          <>
            <p className="text-sm">Versi: {detail.modelVersion}</p>
            {detail.assessment.indobert ? <p className="text-sm">{detail.assessment.caution ? "IndoBERT on-premise mentah" : "IndoBERT on-premise"} ({detail.assessment.indobert.label}): {percent(detail.assessment.indobert.probability)}</p> : <p className="text-sm text-muted">IndoBERT on-premise tidak dipakai pada skor ini. Dalam mode ringan tombol skor ulang tetap memakai n-gram sampai LOCAL_HOAX_URL diisi.</p>}
            {detail.assessment.linear ? <p className="text-sm">{detail.assessment.caution ? "Model linier mentah" : "Model linier"}: {percent(detail.assessment.linear.probability)}</p> : null}
          </>
        )}
        <ul className="list-disc pl-5 text-sm text-muted">
          {(detail.assessment.heuristic?.reasons ?? []).map((reason: string) => <li key={reason}>{reason}</li>)}
        </ul>
        {gap ? <p className="text-sm text-warning">{ENGINE_DIVERGENCE_WARNING}</p> : null}
        <p className="text-sm">Keyakinan indikasi AI: {detail.ai.confidence ?? "rendah"} · {percent(detail.ai.score)}</p>
        <p className="text-sm text-muted">{detail.ai.disclaimer}</p>
        <ul className="list-disc pl-5 text-sm text-muted">
          {(detail.ai.reasons ?? []).map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      </Card>
      <Card className="space-y-3 p-4">
        <h2 className="font-medium">Topik</h2>
        {detail.topics.length === 0 ? <p className="text-sm text-muted">Tidak ada topik ontologi yang cukup kuat.</p> : (
          <ul className="space-y-1 text-sm">
            {detail.topics.map((topic) => (
              <li key={topic.id}>{topic.label} · kemiripan {percent(topic.score)} · kata: {topic.keywordsHit.join(", ") || "—"}</li>
            ))}
          </ul>
        )}
      </Card>
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
      <Card className="space-y-2 p-4">
        <h2 className="font-medium">Ringkasan</h2>
        <p className="text-lg font-semibold">{ringkasan.headline}</p>
        {ringkasan.sentences.map((sentence) => (
          <p key={sentence} className="text-sm leading-6">{sentence}</p>
        ))}
      </Card>
    </div>
  );
}
