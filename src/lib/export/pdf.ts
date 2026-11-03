import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { CaseDetail } from "@/lib/db/types";
import { alertStatusLabel, bandLabel, engineLabel, formatWhen, percent, verdictLabel } from "@/lib/format";

function winAnsi(value: string): string {
  return value.replace(/[^\n\r\t\u0020-\u00ff]/g, "?");
}

export async function casePdf(detail: CaseDetail): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595.28, 841.89]);
  let y = 800;
  const draw = (value: string, options?: { bold?: boolean; size?: number }) => {
    const size = options?.size ?? 11;
    const lines = winAnsi(value).split("\n");
    for (const line of lines) {
      const chunks = line.match(/.{1,90}/g) ?? [""];
      for (const chunk of chunks) {
        if (y < 48) {
          page = doc.addPage([595.28, 841.89]);
          y = 800;
        }
        page.drawText(chunk, {
          x: 48,
          y,
          size,
          font: options?.bold ? bold : font,
          color: rgb(0.1, 0.12, 0.16),
        });
        y -= size + 4;
      }
    }
  };
  draw("Kartika Sentinel — berkas peringatan", { bold: true, size: 16 });
  draw("Rekomendasi saja. Bukan penetapan hoaks. Analis memutuskan.");
  y -= 6;
  draw(`Risiko ${percent(detail.riskScore)} · ${bandLabel(detail.band)} · ${engineLabel(detail.engine)}`, { bold: true });
  draw(`Status peringatan: ${alertStatusLabel(detail.alertStatus)}`);
  draw(`Model: ${detail.modelVersion}`);
  draw(`Waktu unggahan: ${formatWhen(detail.postedAt)}`);
  y -= 6;
  draw("Teks yang dinilai", { bold: true });
  draw(detail.text);
  y -= 6;
  draw("Padanan cek fakta", { bold: true });
  if (detail.matches.length === 0) draw("Tidak ada padanan di atas ambang.");
  for (const match of detail.matches) {
    draw(`${verdictLabel(match.verdict)} · ${percent(match.similarity)} · ${match.source}`);
    draw(match.title);
    if (match.url) draw(match.url);
  }
  draw("");
  draw(detail.recommendation);
  return doc.save();
}
