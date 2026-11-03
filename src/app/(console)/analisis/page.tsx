import { AnalyzeForm } from "@/components/analyze-form";
import { Disclaimer } from "@/components/disclaimer";
import { Card } from "@/components/ui/card";
import { indoBertConfigured } from "@/lib/model/local-indobert";

export default function AnalisisPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Analisis masukan</h1>
      <p className="text-sm leading-6 text-muted">
        Tempel teks Indonesia, URL publik, atau tautan gambar. Gambar tanpa keterangan tidak dapat skor hoaks. YouTube memakai judul, deskripsi, dan transkrip bila ada. Halaman lain hanya diambil jika lolos penjaga SSRF.
      </p>
      <Disclaimer mode={indoBertConfigured() ? "IndoBERT on-premise" : "mode ringan"} />
      <Card className="p-5">
        <AnalyzeForm />
      </Card>
    </div>
  );
}
