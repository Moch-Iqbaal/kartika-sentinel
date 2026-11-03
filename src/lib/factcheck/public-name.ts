/** Nama yang boleh tampil di Ringkasan. Bukan id model. */
export function publicSourceName(source: string, publisher?: string | null): string {
  const pub = publisher?.trim() ?? "";
  const blob = `${source} ${pub}`.toLowerCase();
  if (blob.includes("mafindo")) return "Mafindo";
  if (blob.includes("turnbackhoax")) return "TurnBackHoax";
  if (/umn-cyber|indobert|linear-ngram|n-gram|\//.test(blob)) return "Arsip pemeriksaan fakta";
  if (source.trim() === "Cek Fakta" && pub && !/cek fakta/i.test(pub)) return `Cek Fakta ${pub}`;
  return pub || source.trim() || "Pemeriksaan fakta";
}
