import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseActions } from "@/components/case-actions";
import { Disclaimer } from "@/components/disclaimer";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { currentSession } from "@/lib/auth/session";
import { getCase } from "@/lib/db";
import { alertStatusLabel, bandLabel, caseStatusLabel, engineLabel, percent, verdictLabel } from "@/lib/format";
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
  const gap = detail.assessment.indobert && Math.abs(detail.assessment.indobert.probability - detail.assessment.heuristic.probability) >= 0.35;
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
      <Disclaimer />
      {detail.modelStatus === "bangun" ? (
        <Card className="border-warning/50 p-4 text-sm">Model sedang bangun (cold start). Skor tersimpan memakai cadangan lokal. Skor ulang setelah layanan siap.</Card>
      ) : null}
      {detail.modelStatus === "mati" ? (
        <Card className="p-4 text-sm text-muted">Layanan IndoBERT tidak menjawab. Skor memakai model linier atau heuristik di server web.</Card>
      ) : null}
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-muted">Skor utama</p><p className="text-xl font-semibold">{percent(detail.hoaxScore)}</p><p className="text-xs text-muted">{engineLabel(detail.engine)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Sensitivitas</p><p className="text-xl font-semibold">{percent(detail.sensitivity)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Viralitas</p><p className="text-xl font-semibold">{percent(detail.virality)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Media AI</p><p className="text-xl font-semibold">{detail.ai.flagged ? "Indikasi" : "Tidak menonjol"}</p><p className="text-xs text-muted">{percent(detail.ai.score)}</p></Card>
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
        {detail.assessment.indobert ? <p className="text-sm">IndoBERT lokal ({detail.assessment.indobert.label}): {percent(detail.assessment.indobert.probability)}</p> : <p className="text-sm text-muted">IndoBERT lokal tidak dipakai pada skor yang tersimpan. Tombol skor ulang akan memanggil proses lokal jika hidup.</p>}
        {detail.assessment.linear ? <p className="text-sm">Model linier: {percent(detail.assessment.linear.probability)}</p> : null}
        <ul className="list-disc pl-5 text-sm text-muted">
          {(detail.assessment.heuristic?.reasons ?? []).map((reason: string) => <li key={reason}>{reason}</li>)}
        </ul>
        {gap ? <p className="text-sm text-warning">IndoBERT dan heuristik berselisih jauh. Baca keduanya. Jangan mengandalkan satu angka.</p> : null}
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
            <p className="text-sm font-medium">{match.title}</p>
            <p className="text-xs text-muted">{verdictLabel(match.verdict)} · {percent(match.similarity)} · {match.source} · {match.license}</p>
            <p className="mt-1 text-sm leading-6">{match.summary}</p>
            {match.url ? <SafeLink href={match.url}>{match.url}</SafeLink> : null}
          </article>
        ))}
        {detail.external.length > 0 ? (
          <div className="border-t border-border pt-3">
            <p className="text-sm font-medium">Fact Check Tools</p>
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
        />
      </Card>
      <Card className="space-y-2 p-4">
        <h2 className="font-medium">Linimasa</h2>
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
