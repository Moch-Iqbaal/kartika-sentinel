import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { presentCase } from "@/lib/analyze/present";
import type { CaseDetail } from "@/lib/db/types";
import { alertStatusLabel, caseStatusLabel, engineLabel, formatWhen, percent } from "@/lib/format";

function winAnsi(value: string): string {
  return value.replace(/[^\n\r\t\u0020-\u00ff]/g, "?");
}

export async function casePdf(detail: CaseDetail): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595.28, 841.89]);
  let y = 800;
  const report = presentCase(detail);

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
  draw(report.headline, { bold: true, size: 16 });
  draw("Ini hanya saran. Keputusan tetap pada Anda.", { size: 9, color: [0.35, 0.38, 0.42] });
  draw(report.checkedLabel, { size: 9 });
  y -= 6;
  draw("Bukti utama", { bold: true, size: 12 });
  for (const bullet of report.bullets) {
    draw(bullet.href ? `${bullet.text} ${bullet.href}` : bullet.text);
  }
  y -= 6;
  draw("Ringkasan", { bold: true, size: 12 });
  for (const sentence of report.sentences) draw(sentence);
  y -= 6;
  draw("Skor", { bold: true, size: 12 });
  if (!report.scores) {
    draw("Belum bisa dinilai. Skor hoaks tidak dihitung.");
  } else {
    draw(`${report.scores.utama} (${report.scores.utamaBand})`);
    draw(`${report.scores.sensitivitas} (${report.scores.sensitivitasBand})`);
    draw(`${report.scores.viralitas} (${report.scores.viralitasBand})`);
  }
  draw(report.topicLine);
  if (detail.assessment.caution?.warning) draw(detail.assessment.caution.warning, { size: 9 });
  if (detail.assessment.youtube?.note) draw(detail.assessment.youtube.note, { size: 9 });
  draw(`Peringatan: ${alertStatusLabel(detail.alertStatus)}${detail.caseStatus ? ` · Kasus: ${caseStatusLabel(detail.caseStatus)}` : ""}`, { size: 9 });
  y -= 6;
  draw("Teks yang dinilai", { bold: true, size: 12 });
  if (detail.sourceUrl) draw(detail.sourceUrl, { size: 9 });
  draw(detail.text);
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
  draw("Detail teknis", { bold: true, size: 12 });
  draw(`Penilai: ${engineLabel(detail.engine)}. Versi ${detail.modelVersion}.`, { size: 9 });
  if (detail.assessment.indobert) draw(`IndoBERT ${percent(detail.assessment.indobert.probability)}`, { size: 9 });
  if (detail.assessment.linear) draw(`Model linier ${percent(detail.assessment.linear.probability)}`, { size: 9 });
  draw(`Isyarat tulisan buatan: ${detail.ai.confidence} (${percent(detail.ai.score)}).`, { size: 9 });
  y -= 4;
  draw(`Diekspor ${formatWhen(new Date().toISOString())}`, { size: 8, color: [0.4, 0.42, 0.46] });
  return doc.save();
}
