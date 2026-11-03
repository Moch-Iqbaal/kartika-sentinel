import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { CaseDetail } from "@/lib/db/types";
import { alertStatusLabel, bandLabel, caseStatusLabel, engineLabel, formatWhen, percent, verdictLabel } from "@/lib/format";

function winAnsi(value: string): string {
  return value.replace(/[^\n\r\t\u0020-\u00ff]/g, "?");
}

export async function casePdf(detail: CaseDetail): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595.28, 841.89]);
  let y = 800;

  const newPage = () => {
    page = doc.addPage([595.28, 841.89]);
    y = 800;
  };

  const draw = (value: string, options?: { bold?: boolean; size?: number; color?: [number, number, number] }) => {
    const size = options?.size ?? 10;
    const color = options?.color ?? [0.12, 0.14, 0.18];
    for (const line of winAnsi(value).split("\n")) {
      const chunks = line.match(/.{1,92}/g) ?? [""];
      for (const chunk of chunks) {
        if (y < 56) newPage();
        page.drawText(chunk, {
          x: 48,
          y,
          size,
          font: options?.bold ? bold : font,
          color: rgb(color[0], color[1], color[2]),
        });
        y -= size + 4;
      }
    }
  };

  page.drawRectangle({ x: 0, y: 812, width: 595, height: 30, color: rgb(0.07, 0.1, 0.16) });
  page.drawText("KARTIKA SENTINEL", {
    x: 48,
    y: 822,
    size: 11,
    font: bold,
    color: rgb(0.88, 0.7, 0.36),
  });
  y = 790;
  draw("Berkas peringatan untuk analis", { bold: true, size: 16 });
  draw("Rekomendasi saja. Bukan penetapan hoaks. Manusia yang memutuskan.", { size: 9, color: [0.35, 0.38, 0.42] });
  y -= 8;
  draw("Skor", { bold: true, size: 12 });
  draw(`Risiko ${percent(detail.riskScore)} · pita ${bandLabel(detail.band)}`);
  draw(`Hoaks ${percent(detail.hoaxScore)} · mesin ${engineLabel(detail.engine)} · status model ${detail.modelStatus}`);
  if (detail.assessment.caution?.warning) {
    draw(detail.assessment.caution.warning, { bold: true, color: [0.55, 0.32, 0.05] });
    draw(
      `Tubuh artikel ${detail.assessment.caution.bodyChars} karakter. Keluaran mentah ${percent(detail.assessment.caution.rawProbability)} diturunkan.`,
      { size: 9 },
    );
  }
  draw(`Sensitivitas ${percent(detail.sensitivity)} · viralitas ${percent(detail.virality)}`);
  draw(`Indikasi AI ${detail.ai.confidence} (${percent(detail.ai.score)}). ${detail.ai.disclaimer}`, { size: 9 });
  draw(`Peringatan: ${alertStatusLabel(detail.alertStatus)}${detail.caseStatus ? ` · Kasus: ${caseStatusLabel(detail.caseStatus)}` : ""}`);
  draw(`Model: ${detail.modelVersion}`);
  y -= 6;
  draw("Bukti teks", { bold: true, size: 12 });
  draw(detail.demo ? "Sumber: data demo sintetis." : "Sumber: masukan analis.");
  if (detail.sourceUrl) draw(detail.sourceUrl, { size: 9 });
  draw(detail.text);
  y -= 6;
  draw("Padanan cek fakta", { bold: true, size: 12 });
  if (detail.matches.length === 0) draw("Tidak ada padanan di atas ambang.");
  for (const match of detail.matches) {
    draw(`${verdictLabel(match.verdict)} · kemiripan ${percent(match.similarity)} · ${match.source}`, { bold: true });
    draw(match.title);
    draw(match.summary, { size: 9 });
    if (match.url) draw(match.url, { size: 8 });
  }
  y -= 6;
  draw("Linimasa", { bold: true, size: 12 });
  if (detail.timeline.length === 0) draw("Tidak ada jejak waktu.");
  for (const event of detail.timeline) {
    draw(`${formatWhen(event.at)} · ${event.label}`, { bold: true, size: 10 });
    draw(event.detail, { size: 9 });
  }
  y -= 6;
  draw("Catatan analis", { bold: true, size: 12 });
  draw(detail.analystNote?.trim() ? detail.analystNote : "Belum ada catatan.");
  y -= 6;
  draw("Rekomendasi sistem", { bold: true, size: 12 });
  draw(detail.recommendation);
  draw(`Diekspor ${formatWhen(new Date().toISOString())}`, { size: 8, color: [0.4, 0.42, 0.46] });
  return doc.save();
}
