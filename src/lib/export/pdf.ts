import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { confidenceSentence, decideConfidence } from "@/lib/analyze/confidence";
import { ringkasanFromCase } from "@/lib/analyze/ringkasan";
import type { CaseDetail } from "@/lib/db/types";
import { evidenceFirst, hasHttpUrl } from "@/lib/factcheck/order";
import { NO_STRONG_MATCH } from "@/lib/factcheck/threshold";
import { isMafindoSource, mafindoBadge, turnbackhoaxSearchUrl } from "@/lib/factcheck/turnbackhoax";
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
  const unscored = Boolean(detail.assessment.unscored?.reason);
  draw("Berkas peringatan untuk analis", { bold: true, size: 16 });
  draw("Rekomendasi saja. Bukan penetapan hoaks. Manusia yang memutuskan.", { size: 9, color: [0.35, 0.38, 0.42] });
  y -= 8;
  draw("Bukti utama: padanan cek fakta", { bold: true, size: 12 });
  draw("Tautan sumber adalah bukti yang dibaca lebih dulu. Skor bukan bukti.", { size: 9 });
  const matches = evidenceFirst(detail.matches);
  if (matches.length === 0) draw(NO_STRONG_MATCH);
  for (const match of matches) {
    draw(`${verdictLabel(match.verdict)} · kemiripan ${percent(match.similarity)} · ${match.source}`, { bold: true });
    const article = match.url && hasHttpUrl(match.url) ? match.url : null;
    draw(match.title);
    if (isMafindoSource(match.source)) draw(mafindoBadge(match.verdict), { size: 9 });
    else draw(match.summary, { size: 9 });
    if (article) draw(article, { size: 8 });
    else if (isMafindoSource(match.source)) draw(`Cari di TurnBackHoax ${turnbackhoaxSearchUrl(match.title)}`, { size: 8 });
    else draw("Tautan sumber tidak ada di korpus ini.", { size: 8 });
  }
  for (const item of detail.external) {
    draw(`${item.publisher ? `${item.publisher}: ` : ""}${item.title}${item.rating ? ` (${item.rating})` : ""}`, { bold: true });
    if (item.url && hasHttpUrl(item.url)) draw(item.url, { size: 8 });
  }
  y -= 6;
  draw("Skor", { bold: true, size: 12 });
  if (unscored) {
    draw("Belum bisa dinilai", { bold: true });
    draw(detail.assessment.unscored?.reason ?? "Tidak ada teks isi.");
    draw("Skor hoaks tidak dihitung.");
  } else {
    const confidence = decideConfidence({
      textChars: detail.assessment.caution?.bodyChars ?? detail.text.trim().length,
      shortText: Boolean(detail.assessment.caution?.warning),
      shortKind: detail.assessment.caution?.words != null ? "words" : detail.assessment.caution?.warning ? "chars" : null,
      indobert: detail.assessment.indobert?.probability ?? null,
      linear: detail.assessment.linear?.probability ?? null,
      matchCount: detail.matches.length,
      externalCount: detail.external.length,
    });
    draw(confidenceSentence(confidence), { bold: true });
    draw(`Risiko ${percent(detail.riskScore)} · pita ${bandLabel(detail.band)}`);
    draw(`Hoaks ${percent(detail.hoaxScore)} · mesin ${engineLabel(detail.engine)} · status model ${detail.modelStatus}`);
  }
  if (detail.assessment.caution?.warning) {
    draw(detail.assessment.caution.warning, { bold: true, color: [0.55, 0.32, 0.05] });
    draw(
      detail.assessment.caution.words != null
        ? `Teks ${detail.assessment.caution.words} kata. Keluaran mentah ${percent(detail.assessment.caution.rawProbability)} diturunkan.`
        : `Tubuh artikel ${detail.assessment.caution.bodyChars} karakter. Keluaran mentah ${percent(detail.assessment.caution.rawProbability)} diturunkan.`,
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
  if (detail.assessment.youtube?.note) draw(detail.assessment.youtube.note, { size: 9 });
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
  draw("Rekomendasi sistem", { bold: true, size: 12 });
  draw(detail.recommendation);
  y -= 6;
  const ringkasan = ringkasanFromCase(detail);
  draw("Ringkasan", { bold: true, size: 12 });
  draw(ringkasan.headline, { bold: true });
  for (const sentence of ringkasan.sentences) draw(sentence);
  draw(`Diekspor ${formatWhen(new Date().toISOString())}`, { size: 8, color: [0.4, 0.42, 0.46] });
  return doc.save();
}
