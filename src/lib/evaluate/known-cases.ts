/**
 * Kasus yang pernah salah di meja ini.
 * Angka "sebelumnya" adalah laporan pemilik dan perbaikan yang sudah masuk,
 * bukan hasil ulang IndoBERT pada mesin ini.
 */

export type KnownCase = {
  id: string;
  title: string;
  detail: string;
  before: string;
  now: string;
};

export const KNOWN_FALSE_POSITIVES: KnownCase[] = [
  {
    id: "judul-mbg",
    title: "Pelibatan TNI di MBG Tak Selaras UU",
    detail: "Judul berita tentang kritik masyarakat sipil, bukan hoaks.",
    before: "IndoBERT 99% dan model linier 60,8% pada judul ini.",
    now: "Teks pendek, keyakinan rendah. Karena ini kritik kebijakan, vonis Kemungkinan FAKTA.",
  },
  {
    id: "tniad",
    title: "Rilis tniad.mil.id",
    detail: "Berita resmi TNI AD yang tubuh artikelnya tidak ikut terbaca.",
    before: "Hanya judul dan meta yang dinilai, skor hoaks 99,9%.",
    now: "Teks pendek, keyakinan rendah. Vonis mengikuti angka yang sudah diturunkan: 50% ke atas tetap hoaks.",
  },
  {
    id: "youtube-mbg",
    title: "Video YouTube berita TNI/Polri soal MBG",
    detail: "https://www.youtube.com/watch?v=0uecxWhlS-w",
    before: "IndoBERT 62,4% pada berita ini, dan angka itu terbaca sebagai kemungkinan hoaks.",
    now: "Kanal Kompas TV adalah asal video, bukan berita lain. Angka 62,4% tetap hoaks. Bila penilaian lain jauh berbeda, keyakinan rendah.",
  },
  {
    id: "antara-mbg",
    title: "Infografis Antara peran TNI dukung MBG",
    detail: "https://cdn.antaranews.com/cache/infografis/1140x2100/2025/06/08/20250608-peran-tni-dukung-mbg.jpg?quality=80",
    before: "String metadata ikut dinilai, skor hoaks 99,9%.",
    now: "Tanpa teks isi: Belum bisa dinilai, tanpa skor hoaks.",
  },
];
