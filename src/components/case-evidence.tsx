import { TermTip } from "@/components/term-tip";
import { glossaryTip } from "@/lib/glossary";
import type { EvidenceBullet } from "@/lib/analyze/report";
import { hasHttpUrl } from "@/lib/factcheck/order";

function SafeLink({ href, children }: { href: string; children: string }) {
  if (!hasHttpUrl(href)) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-info underline-offset-2 hover:underline">
      {children}
    </a>
  );
}

export function CaseEvidence({ bullets }: { bullets: EvidenceBullet[] }) {
  return (
    <section className="space-y-2 rounded-xl border border-gold/40 bg-card p-4">
      <h2 className="inline-flex items-center text-base font-semibold">
        Bukti utama
        <TermTip {...glossaryTip("bukti-utama")} />
      </h2>
      <ul className="space-y-2 text-sm leading-6">
        {bullets.map((bullet) => (
          <li key={bullet.text} className="border-l border-gold/40 pl-3">
            {bullet.href ? <SafeLink href={bullet.href}>{bullet.text}</SafeLink> : bullet.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
