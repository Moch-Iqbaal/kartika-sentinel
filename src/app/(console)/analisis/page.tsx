import { AnalyzeForm } from "@/components/analyze-form";
import { Disclaimer } from "@/components/disclaimer";
import { Card } from "@/components/ui/card";
export default function AnalisisPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Analisis masukan</h1>
      <p className="text-sm leading-6 text-muted">
        Tempel teks, tautan berita, atau tautan gambar. Gambar tanpa keterangan tidak dinilai. Video YouTube memakai judul, keterangan, dan ucapan bila ada.
      </p>
      <Disclaimer />
      <Card className="p-5">
        <AnalyzeForm />
      </Card>
    </div>
  );
}
