import { Card } from "@/components/ui/card";
import { glossaryEntries } from "@/lib/glossary";

export default function GlossaryPage() {
  const entries = glossaryEntries();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Panduan Istilah</h1>
      <p className="max-w-3xl text-sm leading-6 text-muted">
        Arti kata yang tampil di dasbor dan berkas peringatan. Angka ambang dibaca dari kode yang menghitung skor, lalu dituliskan di sini supaya analis tidak perlu membuka sumber.
      </p>
      <nav aria-label="Daftar istilah" className="flex flex-wrap gap-2 text-sm">
        {entries.map((entry) => (
          <a key={entry.id} href={`#${entry.id}`} className="rounded-full border border-border px-3 py-1 hover:text-gold">
            {entry.title}
          </a>
        ))}
      </nav>
      {entries.map((entry) => (
        <Card key={entry.id} id={entry.id} className="scroll-mt-6 space-y-2 p-4">
          <h2 className="font-medium">{entry.title}</h2>
          {entry.paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-6 text-muted">{paragraph}</p>
          ))}
        </Card>
      ))}
    </div>
  );
}
