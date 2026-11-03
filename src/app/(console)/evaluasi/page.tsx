import { TermTip } from "@/components/term-tip";
import { Card } from "@/components/ui/card";
import { glossaryTip } from "@/lib/glossary";
import { loadEvaluation, metricsFromCounts, type Confusion } from "@/lib/evaluate/report";

function decimal(value: number): string {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value);
}

function count(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
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
  if (!report) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Evaluasi mesin</h1>
        <Card className="p-4 text-sm">{error || "Laporan belum ada. Jalankan npm run eval."}</Card>
      </div>
    );
  }
  const linear = metricsFromCounts(report.linear.confusion!);
  const indo = report.indobert.ran && report.indobert.confusion ? metricsFromCounts(report.indobert.confusion) : null;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="inline-flex items-center text-2xl font-semibold">
          Evaluasi mesin
          <TermTip {...glossaryTip("evaluasi-mesin")} />
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Angka di halaman ini dihitung skrip <span className="font-mono">npm run eval</span> pada {report.generatedAt}. Bukan angka kartu model, dan bukan perkiraan.
        </p>
      </div>
      <Card className="space-y-2 p-4 text-sm leading-6">
        <h2 className="font-medium">Data</h2>
        <p>
          {report.dataset.name}, dikumpulkan {report.dataset.collectedBy} tahun {report.dataset.collectedYear}. Lisensi {report.dataset.license}. {report.dataset.copyright}.
        </p>
        <p>
          Berkas {report.dataset.file}. {count(report.dataset.rowsInFile)} baris di CSV, {count(report.dataset.labeledUsed)} dipakai (label hoaks atau valid, tweet minimal 15 karakter). {count(report.dataset.excludedUnlabeledOrShort)} baris label “?” atau terlalu pendek tidak masuk.
        </p>
        <p>
          Potongan latih {count(report.split.trainN)} dan hold-out {count(report.split.holdoutN)}, seed {report.split.seed}, {Math.round(report.split.trainFraction * 100)}% latih. Indeks yang sama di kedua potongan: {count(report.split.indexOverlap)}. Teks hold-out yang juga ada di latih dibuang: {count(report.split.droppedTrainText)}. Yang dinilai: {count(report.split.evaluatedN)}.
        </p>
        <p className="break-all text-xs text-muted">SHA-256 CSV: {report.dataset.sha256}</p>
        <p className="text-xs text-muted">
          Sumber: {report.dataset.url}. Model linier tidak dilatih ulang di sini. IndoBERT penulis model punya angka sendiri di kartu Hugging Face. Itu bukan hasil halaman ini.
        </p>
      </Card>
      <Card className="space-y-3 p-4">
        <h2 className="font-medium">Model linier</h2>
        <p className="text-sm leading-6">{report.linear.note}</p>
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
        <Matrix confusion={report.linear.confusion!} />
        <h3 className="inline-flex items-center text-sm font-medium">Contoh positif palsu <TermTip {...glossaryTip("positif-palsu")} /></h3>
        {(report.linear.falsePositives ?? []).length === 0 ? <p className="text-sm text-muted">Tidak ada.</p> : (
          <ul className="space-y-2 text-sm">
            {(report.linear.falsePositives ?? []).map((example) => (
              <li key={example.excerpt} className="rounded-lg border border-border p-3">
                <p>{example.excerpt}</p>
                <p className="mt-1 text-xs text-muted">Label valid · probabilitas hoaks {decimal(example.probability)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="space-y-3 p-4">
        <h2 className="font-medium">IndoBERT</h2>
        <p className="text-sm leading-6">{report.indobert.note}</p>
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
        ) : (
          <p className="text-sm text-muted">Tidak ada angka IndoBERT pada laporan ini.</p>
        )}
      </Card>
    </div>
  );
}
