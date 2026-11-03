import { AnalyzeForm } from "@/components/analyze-form";
import { Disclaimer } from "@/components/disclaimer";
import { Card } from "@/components/ui/card";
import { indoBertConfigured } from "@/lib/model/local-indobert";

export default function AnalisisPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Analisis masukan</h1>
      <p className="text-sm leading-6 text-muted">
        Tempel teks Indonesia atau URL publik. YouTube dibaca lewat oEmbed. Halaman lain hanya diambil jika lolos penjaga SSRF: http/https, bukan alamat privat, ukuran dan tipe konten dibatasi.
      </p>
      <Disclaimer mode={indoBertConfigured() ? "IndoBERT on-premise" : "mode ringan"} />
      <Card className="p-5">
        <AnalyzeForm />
      </Card>
    </div>
  );
}
