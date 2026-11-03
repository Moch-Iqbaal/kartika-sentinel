import { TermTip } from "@/components/term-tip";
import { glossaryTip } from "@/lib/glossary";
import type { CaseDetail } from "@/lib/db/types";
import { evidenceFirst, hasHttpUrl } from "@/lib/factcheck/order";
import { percent, verdictLabel } from "@/lib/format";

function SafeLink({ href, children }: { href: string; children: string }) {
  if (!hasHttpUrl(href)) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="font-medium text-info underline-offset-2 hover:underline">
      {children}
    </a>
  );
}

export function CaseEvidence({ detail }: { detail: CaseDetail }) {
  const matches = evidenceFirst(detail.matches);
  const linked = matches.filter((match) => hasHttpUrl(match.url)).length;
  return (
    <section className="space-y-3 rounded-xl border border-gold/40 bg-card p-4">
      <div>
        <h2 className="inline-flex items-center text-base font-semibold">
          Bukti utama
          <TermTip {...glossaryTip("bukti-utama")} />
        </h2>
        <p className="mt-1 text-sm text-muted">
          Padanan cek fakta dan tautan sumber. Ini yang dibaca lebih dulu. Skor bukan bukti.
        </p>
      </div>
      {detail.platform === "gambar" && !detail.assessment.unscored?.reason ? (
        <p className="text-sm">Padanan di bawah dibandingkan dengan keterangan yang ditempel, bukan dengan piksel gambar.</p>
      ) : null}
      {matches.length === 0 && detail.external.length === 0 ? (
        <p className="text-sm text-muted">Tidak ada padanan cek fakta di atas ambang, dan tidak ada tautan sumber.</p>
      ) : null}
      {matches.length > 0 ? (
        <p className="text-xs text-muted">{linked} dari {matches.length} padanan punya tautan sumber.</p>
      ) : null}
      {matches.map((match) => (
        <article key={match.id} className="border-t border-border pt-3">
          <p className="text-sm font-medium">
            {match.url && hasHttpUrl(match.url) ? <SafeLink href={match.url}>{match.title}</SafeLink> : match.title}
            <TermTip {...glossaryTip("padanan")} />
          </p>
          <p className="text-xs text-muted">
            {verdictLabel(match.verdict)} · kemiripan {percent(match.similarity)} · {match.source} · {match.license}
          </p>
          <p className="mt-1 text-sm leading-6">{match.summary}</p>
          {match.url && hasHttpUrl(match.url) ? <SafeLink href={match.url}>{match.url}</SafeLink> : (
            <p className="text-xs text-muted">Tautan sumber tidak ada di korpus ini.</p>
          )}
        </article>
      ))}
      {detail.external.length > 0 ? (
        <div className="border-t border-border pt-3">
          <p className="inline-flex items-center text-sm font-medium">
            Fact Check Tools
            <TermTip {...glossaryTip("fact-check-tools")} />
          </p>
          {detail.external.map((item) => (
            <p key={`${item.url}-${item.title}`} className="mt-2 text-sm">
              {item.publisher ? `${item.publisher}: ` : ""}
              {item.url && hasHttpUrl(item.url) ? <SafeLink href={item.url}>{item.title}</SafeLink> : item.title}
              {item.rating ? ` (${item.rating})` : ""}
              {item.url && hasHttpUrl(item.url) ? <span className="mt-1 block text-xs"><SafeLink href={item.url}>{item.url}</SafeLink></span> : null}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
