import { CircleAlert, CircleCheck, EyeOff } from "lucide-react";
import { TermTip } from "@/components/term-tip";
import { Card } from "@/components/ui/card";
import { glossaryTip } from "@/lib/glossary";
import { KNOWN_FALSE_POSITIVES } from "@/lib/evaluate/known-cases";
import { plainEval } from "@/lib/evaluate/plain";
import { loadEvaluation, metricsFromCounts, type Confusion } from "@/lib/evaluate/report";

function decimal(value: number): string {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value);
}

function count(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

function shorten(text: string, max = 110): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function Matrix({ confusion }: { confusion: Confusion }) {
  const cells = [
    ["Prediksi hoaks, label hoaks", confusion.tp],
    ["Prediksi hoaks, label valid", confusion.fp],
    ["Prediksi valid, label hoaks", confusion.fn],
    ["Prediksi valid, label valid", confusion.tn],
  ];
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {cells.map(([label, value]) => (
        <div key={String(label)} className="rounded-lg border border-border px-3 py-2">
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="text-lg font-semibold">{count(Number(value))}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function EvaluasiPage() {
  let report: ReturnType<typeof loadEvaluation> | null = null;
  let error = "";
  try {
    report = loadEvaluation();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Laporan evaluasi tidak bisa dibaca.";
  }
  if (!report?.linear.confusion) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Evaluasi mesin</h1>
        <Card className="p-4 text-sm">{error || "Laporan belum ada. Jalankan npm run eval."}</Card>
      </div>
    );
  }
  const confusion = report.linear.confusion;
  const plain = plainEval(confusion);
  const linear = metricsFromCounts(confusion);
  const indo = report.indobert.ran && report.indobert.confusion ? metricsFromCounts(report.indobert.confusion) : null;
  const corpusName = report.dataset.name.split("/").pop() || report.dataset.name;
  const examples = report.linear.falsePositives ?? [];
  return (
    <div className="space-y-6">
      <div className="max-w-3xl space-y-3">
        <h1 className="inline-flex items-center text-2xl font-semibold">
          Evaluasi mesin
          <TermTip {...glossaryTip("evaluasi-mesin")} />
        </h1>
        <p className="text-sm leading-6">
          Kami menguji mesin dengan berita yang sudah diketahui hoaks/bukan, dan belum pernah dilihat mesin saat belajar. Ini hasil jujurnya.
        </p>
        <p className="text-2xl font-semibold leading-snug">{plain.headline}</p>
        <p className="text-sm text-muted">
          Data uji:{" "}
          <a href={report.dataset.url} className="text-info underline-offset-2 hover:underline" target="_blank" rel="noreferrer noopener">
            {corpusName}
          </a>
          , {report.dataset.collectedBy}
          <TermTip {...glossaryTip("data-uji")} />
        </p>
        {report.indobert.ran ? null : (
          <p className="text-sm text-muted">Angka di halaman ini dari penilaian cadangan. Penilai utama belum diuji pada kumpulan yang sama.</p>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="space-y-2 p-4">
          <CircleCheck className="text-ok" aria-hidden />
          <h2 className="inline-flex items-center text-sm font-medium">
            Tebakan benar
            <TermTip {...glossaryTip("tebakan-benar")} />
          </h2>
          <p className="text-3xl font-semibold">{count(plain.correct)}</p>
          <p className="text-sm leading-6">Mesin menebak sesuai label, baik hoaks maupun bukan hoaks.</p>
        </Card>
        <Card className="space-y-2 p-4">
          <CircleAlert className="text-warning" aria-hidden />
          <h2 className="inline-flex items-center text-sm font-medium">
            Salah tuduh
            <TermTip {...glossaryTip("salah-tuduh")} />
          </h2>
          <p className="text-3xl font-semibold">{count(plain.falseAlarm)}</p>
          <p className="text-sm leading-6">Berita benar dibilang hoaks.</p>
        </Card>
        <Card className="space-y-2 p-4">
          <EyeOff className="text-danger" aria-hidden />
          <h2 className="inline-flex items-center text-sm font-medium">
            Kecolongan
            <TermTip {...glossaryTip("kecolongan")} />
          </h2>
          <p className="text-3xl font-semibold">{count(plain.missed)}</p>
          <p className="text-sm leading-6">Hoaks lolos karena dikira bukan hoaks.</p>
        </Card>
      </div>
      <Card className="space-y-2 p-4">
        <p className="text-sm leading-6">{plain.takeaway}</p>
        <p className="inline-flex items-center text-sm font-medium">
          Artinya buat analis
          <TermTip {...glossaryTip("artinya-analis")} />
        </p>
        <p className="text-sm leading-6">Hasil mesin adalah peringatan dini, keputusan akhir tetap di manusia.</p>
      </Card>
      <section className="space-y-3">
        <h2 className="inline-flex items-center text-lg font-medium">
          Contoh yang masih salah
          <TermTip {...glossaryTip("contoh-salah")} />
        </h2>
        {examples.length === 0 ? <p className="text-sm text-muted">Tidak ada cuplikan salah tuduh di laporan ini.</p> : (
          <ul className="space-y-2">
            {examples.map((example) => (
              <li key={example.excerpt} className="rounded-xl border border-border bg-card p-4 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-warning">Salah tuduh</p>
                <p className="mt-1 leading-6">{shorten(example.excerpt)}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm leading-6 text-muted">
          Kecolongan ada {count(plain.missed)}, tetapi teks hoaks yang lolos tidak disimpan satu per satu di laporan ini.
        </p>
      </section>
      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="inline-flex cursor-pointer items-center text-xs text-info">Detail teknis</summary>
        <div className="mt-4 space-y-4 text-sm leading-6">
          <p>
            {report.dataset.name}, dikumpulkan {report.dataset.collectedBy} tahun {report.dataset.collectedYear}. Lisensi {report.dataset.license}. {report.dataset.copyright}.
          </p>
          <p>
            Berkas {report.dataset.file}. {count(report.dataset.rowsInFile)} baris di CSV, {count(report.dataset.labeledUsed)} dipakai. {count(report.dataset.excludedUnlabeledOrShort)} baris label “?” atau terlalu pendek tidak masuk.
          </p>
          <p>
            Latih {count(report.split.trainN)}, hold-out {count(report.split.holdoutN)}, seed {report.split.seed}, {Math.round(report.split.trainFraction * 100)}% latih. Indeks yang sama di kedua potongan: {count(report.split.indexOverlap)}. Teks uji yang juga ada di latih dibuang: {count(report.split.droppedTrainText)}. Yang dinilai: {count(report.split.evaluatedN)}.
          </p>
          <p className="break-all text-xs text-muted">SHA-256 CSV: {report.dataset.sha256}</p>
          <p className="text-xs text-muted">Dihitung {report.generatedAt}. {report.linear.note}</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <p className="inline-flex items-center text-xs text-muted">Akurasi <TermTip {...glossaryTip("akurasi")} /></p>
              <p className="text-xl font-semibold">{decimal(linear.accuracy)}</p>
            </div>
            <div>
              <p className="inline-flex items-center text-xs text-muted">Presisi hoaks <TermTip {...glossaryTip("presisi-hoaks")} /></p>
              <p className="text-xl font-semibold">{decimal(linear.precision)}</p>
            </div>
            <div>
              <p className="inline-flex items-center text-xs text-muted">Recall hoaks <TermTip {...glossaryTip("recall-hoaks")} /></p>
              <p className="text-xl font-semibold">{decimal(linear.recall)}</p>
            </div>
            <div>
              <p className="inline-flex items-center text-xs text-muted">F1 hoaks <TermTip {...glossaryTip("f1-hoaks")} /></p>
              <p className="text-xl font-semibold">{decimal(linear.f1)}</p>
            </div>
          </div>
          <h3 className="inline-flex items-center text-sm font-medium">Matriks kekeliruan <TermTip {...glossaryTip("matriks-kekeliruan")} /></h3>
          <Matrix confusion={confusion} />
          <h3 className="text-sm font-medium">IndoBERT</h3>
          <p>{report.indobert.note}</p>
          {indo && report.indobert.confusion ? (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <div><p className="text-xs text-muted">Akurasi</p><p className="text-xl font-semibold">{decimal(indo.accuracy)}</p></div>
                <div><p className="text-xs text-muted">Presisi hoaks</p><p className="text-xl font-semibold">{decimal(indo.precision)}</p></div>
                <div><p className="text-xs text-muted">Recall hoaks</p><p className="text-xl font-semibold">{decimal(indo.recall)}</p></div>
                <div><p className="text-xs text-muted">F1 hoaks</p><p className="text-xl font-semibold">{decimal(indo.f1)}</p></div>
              </div>
              <Matrix confusion={report.indobert.confusion} />
            </>
          ) : null}
          <h3 className="inline-flex items-center text-sm font-medium">Kasus yang pernah salah <TermTip {...glossaryTip("kasus-salah")} /></h3>
          <p className="text-muted">Angka “sebelumnya” adalah laporan pemilik, bukan pengukuran ulang IndoBERT.</p>
          <ul className="space-y-3">
            {KNOWN_FALSE_POSITIVES.map((item) => (
              <li key={item.id} className="rounded-lg border border-border p-3">
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 break-all text-muted">{item.detail}</p>
                <p className="mt-2">Sebelumnya: {item.before}</p>
                <p>Sekarang: {item.now}</p>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}
