import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseActions } from "@/components/case-actions";
import { TermTip } from "@/components/term-tip";
import { glossaryTip } from "@/lib/glossary";
import { Disclaimer } from "@/components/disclaimer";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { currentSession } from "@/lib/auth/session";
import { getCase } from "@/lib/db";
import { alertStatusLabel, bandLabel, caseStatusLabel, engineLabel, modelModeLabel, percent, verdictLabel } from "@/lib/format";
import { ENGINE_DIVERGENCE, ENGINE_DIVERGENCE_WARNING } from "@/lib/model/classify";
import { displayHandle } from "@/lib/security/redact";

function httpUrl(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function SafeLink({ href, children }: { href: string; children: string }) {
  const safe = httpUrl(href);
  if (!safe) return <span>{children}</span>;
  return (
    <a href={safe} target="_blank" rel="noreferrer noopener" className="text-info underline-offset-2 hover:underline">
      {children}
    </a>
  );
}

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getCase(id);
  if (!detail) notFound();
  const session = await currentSession();
  const canEdit = Boolean(session && (session.role === "admin" || session.sub === detail.assignedTo));
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
        <Badge className={detail.band === "kritis" ? "border-danger text-danger" : ""}>
          {bandLabel(detail.band)} · {percent(detail.riskScore)}
        </Badge>
      </div>
      <Disclaimer mode={modelModeLabel(detail.modelStatus)} />
      {detail.assessment.caution?.warning ? (
        <Card className="border-warning/50 p-4 text-sm">
          <p className="font-medium text-warning">{detail.assessment.caution.warning}</p>
          <p className="mt-1">
            Tubuh artikel yang terbaca {detail.assessment.caution.bodyChars} karakter, di bawah ambang 200.
            Skor utama ditarik mendekati 50% dari keluaran mentah {percent(detail.assessment.caution.rawProbability)} karena teks sependek itu tidak cukup untuk menilai hoaks.
          </p>
        </Card>
      ) : null}
      {detail.modelStatus === "ringan" || detail.modelStatus === "dilewati" ? (
        <Card className="p-4 text-sm">mode ringan. Skor ini dari model n-gram dan heuristik, tanpa panggilan IndoBERT.</Card>
      ) : null}
      {detail.modelStatus === "bangun" ? (
        <Card className="border-warning/50 p-4 text-sm">IndoBERT on-premise sedang bangun. Skor tersimpan memakai model n-gram. Skor ulang setelah tunnel dan proses di Mac siap.</Card>
      ) : null}
      {detail.modelStatus === "mati" ? (
        <Card className="p-4 text-sm text-muted">IndoBERT on-premise tidak menjawab. Skor memakai model n-gram atau heuristik di server web.</Card>
      ) : null}
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="flex items-center text-xs text-muted">Skor utama <TermTip {...glossaryTip("skor-utama")} /></p>
          <p className="text-xl font-semibold">{percent(detail.hoaxScore)}</p>
          <p className="text-xs text-muted">{engineLabel(detail.engine)}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center text-xs text-muted">Sensitivitas <TermTip {...glossaryTip("sensitivitas")} /></p>
          <p className="text-xl font-semibold">{percent(detail.sensitivity)}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center text-xs text-muted">Viralitas <TermTip {...glossaryTip("viralitas")} /></p>
          <p className="text-xl font-semibold">{percent(detail.virality)}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center text-xs text-muted">Media AI <TermTip {...glossaryTip("media-ai")} /></p>
          <p className="text-xl font-semibold">{detail.ai.flagged ? "Indikasi" : "Tidak menonjol"}</p>
          <p className="text-xs text-muted">{percent(detail.ai.score)}</p>
        </Card>
      </div>
      <Card className="space-y-3 p-4">
        <h2 className="font-medium">Teks yang dinilai</h2>
        <p className="whitespace-pre-wrap text-sm leading-6">{detail.text}</p>
        <p className="text-xs text-muted">Pegangan: {displayHandle(detail.authorHash)} · {detail.platform}</p>
        {detail.sourceUrl ? <SafeLink href={detail.sourceUrl}>{detail.sourceUrl}</SafeLink> : null}
      </Card>
      <Card className="space-y-2 p-4">
        <h2 className="font-medium">Mesin skor</h2>
        <p className="text-sm">Versi: {detail.modelVersion}</p>
        {detail.assessment.indobert ? <p className="text-sm">{detail.assessment.caution ? "IndoBERT on-premise mentah" : "IndoBERT on-premise"} ({detail.assessment.indobert.label}): {percent(detail.assessment.indobert.probability)}</p> : <p className="text-sm text-muted">IndoBERT on-premise tidak dipakai pada skor ini. Dalam mode ringan tombol skor ulang tetap memakai n-gram sampai LOCAL_HOAX_URL diisi.</p>}
        {detail.assessment.linear ? <p className="text-sm">{detail.assessment.caution ? "Model linier mentah" : "Model linier"}: {percent(detail.assessment.linear.probability)}</p> : null}
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
        <h2 className="font-medium">Padanan cek fakta</h2>
        {detail.matches.length === 0 ? <p className="text-sm text-muted">Tidak ada padanan di atas ambang kemiripan.</p> : detail.matches.map((match) => (
          <article key={match.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <p className="inline-flex items-center text-sm font-medium">
              {match.title}
              <TermTip {...glossaryTip("padanan")} />
            </p>
            <p className="text-xs text-muted">{verdictLabel(match.verdict)} · {percent(match.similarity)} · {match.source} · {match.license}</p>
            <p className="mt-1 text-sm leading-6">{match.summary}</p>
            {match.url ? <SafeLink href={match.url}>{match.url}</SafeLink> : null}
          </article>
        ))}
        {detail.external.length > 0 ? (
          <div className="border-t border-border pt-3">
            <p className="inline-flex items-center text-sm font-medium">
              Fact Check Tools
              <TermTip {...glossaryTip("fact-check-tools")} />
            </p>
            {detail.external.map((item) => (
              <p key={`${item.url}-${item.title}`} className="mt-1 text-sm">
                {item.publisher ? `${item.publisher}: ` : ""}{item.title}
                {item.rating ? ` (${item.rating})` : ""}{" "}
                {item.url ? <SafeLink href={item.url}>tautan</SafeLink> : null}
              </p>
            ))}
          </div>
        ) : null}
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
    </div>
  );
}
