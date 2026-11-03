import { FEATURE_DIM } from "@/lib/model/features";
import {
  AI_CONFIDENCE_SEDANG_MIN,
  AI_CONFIDENCE_TINGGI_MIN,
  AI_SCORE_CAP,
  AI_TEXT_DISCLAIMER,
} from "@/lib/model/ai-confidence";
import { ENGINE_DIVERGENCE, ENGINE_DIVERGENCE_WARNING } from "@/lib/model/classify";
import { IMAGE_METADATA_DISCLAIMER } from "@/lib/media/metadata";
import { NO_TOPIC_SENSITIVITY, TOPIC_SIMILARITY_MIN, TOPICS } from "@/lib/ontology/topics";
import { bandLabel, percent, recommendation } from "@/lib/format";
import { AUDIT_LIST_LIMIT, DEMO_RETENTION_DAYS } from "@/lib/limits";
import { displayHandle } from "@/lib/security/redact";
import { MIN_RELIABLE_CHARS, SHORT_TEXT_KEEP, SHORT_TEXT_WARNING } from "@/lib/ingest/short-text";
import {
  BAND_KRITIS_MIN,
  BAND_PRIORITAS_MIN,
  EFFECTIVE_VIRALITY_FLOOR,
  EFFECTIVE_VIRALITY_SPAN,
  VIRALITY_COMMENT_WEIGHT,
  VIRALITY_ENGAGEMENT_CEILING,
  VIRALITY_ENGAGEMENT_WEIGHT,
  VIRALITY_LIKE_WEIGHT,
  VIRALITY_MIN_HOURS,
  VIRALITY_VELOCITY_CEILING,
  VIRALITY_VELOCITY_WEIGHT,
} from "@/lib/scoring/risk";

/**
 * Istilah yang tampil di aplikasi, dengan angka yang diambil dari kode skor.
 * Jangan menaruh ambang baru di sini. Tambahkan konstanta di modul yang menghitungnya.
 */

export type GlossaryEntry = {
  id: string;
  title: string;
  summary: string;
  paragraphs: string[];
};

function decimal(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
}

const emptyHandle = displayHandle(null);
const handleSample = displayHandle("0123456789abcdef");
const handlePrefix = "sid:";
const handleVisible = handleSample.startsWith(handlePrefix) ? handleSample.length - handlePrefix.length : 0;

export function glossaryEntries(): GlossaryEntry[] {
  const topics = TOPICS.map((topic) => `${topic.label} ${percent(topic.sensitivity)}`).join(", ");
  return [
    {
      id: "skor-utama",
      title: "Skor utama",
      summary: "Perkiraan peluang hoaks dari satu mesin. Makin tinggi, makin mirip hoaks. Bukan penetapan.",
      paragraphs: [
        "Skor utama adalah probabilitas hoaks dari satu mesin yang sedang dipakai. Makin tinggi angkanya, makin besar perkiraan bahwa teks itu hoaks. Sistem hanya merekomendasikan. Putusan tetap pada analis. Skor bukan penetapan hoaks.",
        "Mesin tidak dicampur. Urutannya: IndoBERT on-premise bila prosesnya hidup, lalu model linier n-gram yang bobotnya ada di repo, lalu heuristik leksikal. Heuristik selalu dihitung supaya alasannya tetap terlihat, tetapi angka itu tidak dirata-rata ke skor utama.",
        `Bila tubuh artikel dari URL lebih pendek dari ${MIN_RELIABLE_CHARS} karakter, skor utama ditarik mendekati 50%: jarak ke 50% dikalikan ${decimal(SHORT_TEXT_KEEP)}. Peringatan yang tampil: “${SHORT_TEXT_WARNING}”. Keluaran mesin mentah tetap disimpan terpisah dan tidak dipakai sebagai skor utama.`,
      ],
    },
    {
      id: "sensitivitas",
      title: "Sensitivitas",
      summary: "Bobot kebijakan topik untuk peringkat. Tinggi berarti topik yang lebih peka. Tanpa topik, ada lantai, bukan nol.",
      paragraphs: [
        "Sensitivitas adalah bobot kebijakan untuk peringkat, pada skala 0 sampai 1. Ia bukan statistik korban atau operasi. Bobot yang lebih tinggi menaikkan risiko untuk topik yang kebijakan peringkat anggap lebih peka. Bobot yang lebih rendah, dan lantai bila tidak ada topik yang cocok, berarti topik netral atau tidak dikenali.",
        `Jika tidak ada topik ontologi yang cocok, sensitivitas yang masuk rumus adalah lantai ${percent(NO_TOPIC_SENSITIVITY)}. Lantai itu supaya hoaks umum tidak hilang dari peringkat, tetapi tetap di bawah topik yang berbobot.`,
        "Jika ada topik yang cocok, yang dipakai adalah bobot topik dikalikan skor kecocokannya. Kecocokan dijepit ke 1, lalu diambil nilai terbesar di antara topik yang kena, dan hasil akhir juga dijepit ke 1.",
        `Bobot yang tersimpan: ${topics}.`,
      ],
    },
    {
      id: "viralitas",
      title: "Viralitas",
      summary: "Kecepatan sebar dari suka, sebar, dan komentar. 0% berarti tidak ada data engagement, bukan bukti konten tidak viral.",
      paragraphs: [
        "Viralitas pada kartu adalah angka 0 sampai 1 dari data engagement, bukan konstanta universal. Jika tidak ada titik metrik, hasilnya 0. Masukan analis (teks, URL, atau gambar) juga disimpan dengan viralitas 0 karena tidak ada rangkaian suka, sebar, dan komentar. Pegangan akun, bila ada, di-hash terpisah dan tidak mengisi angka ini. Jadi 0% berarti data sebaran tidak ada, bukan kesimpulan bahwa konten tidak viral.",
        `Pada titik pengamatan terakhir, engagement = sebar + ${decimal(VIRALITY_LIKE_WEIGHT)} × suka + ${decimal(VIRALITY_COMMENT_WEIGHT)} × komentar. Jika ada sedikitnya dua titik, kecepatan = kenaikan sebar per jam. Jarak waktu antar titik minimal ${decimal(VIRALITY_MIN_HOURS)} jam supaya kecepatan tidak meledak.`,
        `Bagian engagement dibagi log(1 + ${new Intl.NumberFormat("id-ID").format(VIRALITY_ENGAGEMENT_CEILING)}). Bagian kecepatan dibagi log(1 + ${new Intl.NumberFormat("id-ID").format(VIRALITY_VELOCITY_CEILING)}). Viralitas = ${decimal(VIRALITY_ENGAGEMENT_WEIGHT)} × bagian engagement + ${decimal(VIRALITY_VELOCITY_WEIGHT)} × bagian kecepatan, lalu dijepit ke 0–1. Langit ${new Intl.NumberFormat("id-ID").format(VIRALITY_ENGAGEMENT_CEILING)} dan ${new Intl.NumberFormat("id-ID").format(VIRALITY_VELOCITY_CEILING)} hanya menormalkan angka umpan demo.`,
        `Yang masuk rumus risiko bukan angka kartu mentah, melainkan viralitas efektif = ${decimal(EFFECTIVE_VIRALITY_FLOOR)} + ${decimal(EFFECTIVE_VIRALITY_SPAN)} × viralitas. Pada kartu 0%, viralitas efektif tetap ${decimal(EFFECTIVE_VIRALITY_FLOOR)}, supaya klaim yang baru muncul tidak jatuh ke nol hanya karena sebarannya masih kecil.`,
      ],
    },
    {
      id: "media-ai",
      title: "Media AI",
      summary: "Isyarat gaya dan metadata. Keyakinan rendah berarti sinyal lemah, bukan bukti tulisan manusia, dan bukan deteksi deepfake.",
      paragraphs: [
        `Kartu Media AI memakai isyarat yang sama dengan baris “Keyakinan indikasi AI”. ${AI_TEXT_DISCLAIMER}`,
        `Keyakinan tinggi bila skor isyarat minimal ${percent(AI_CONFIDENCE_TINGGI_MIN)}, sedang bila minimal ${percent(AI_CONFIDENCE_SEDANG_MIN)}, selain itu rendah. Skor isyarat dijepit di ${percent(AI_SCORE_CAP)}. Kartu menulis “Indikasi” bila keyakinan bukan rendah dan ada isyarat, atau bila metadata gambar memuat nama pembuat. Selain itu kartu menulis “Tidak menonjol”.`,
        "Isyarat teks datang dari kata yang menyebut deepfake atau buatan AI, ditambah stilometri: panjang kalimat yang terlalu seragam, keberagaman kata yang rendah, dan frasa transisi yang berulang. Stilometri adalah penjelasan gaya, bukan bukti teks dihasilkan mesin, dan bukan perplexity model bahasa.",
        IMAGE_METADATA_DISCLAIMER,
        "Nama pembuat yang terbaca di byte gambar (misalnya perangkat lunak generatif) menaikkan keyakinan menjadi tinggi. Rangkaian byte c2pa atau jumbf hanya penanda yang bisa berarti kredensial konten. Tanda tangannya tidak diverifikasi, dan penanda itu bukan vonis palsu. Metadata yang kosong tidak membuktikan gambar asli.",
      ],
    },
    {
      id: "pita",
      title: "Pita",
      summary: `Pita dihitung dari risiko, bukan dari skor utama. ${bandLabel("kritis")} mulai ${percent(BAND_KRITIS_MIN)}, ${bandLabel("prioritas")} mulai ${percent(BAND_PRIORITAS_MIN)}, selain itu ${bandLabel("pantau")}.`,
      paragraphs: [
        "Pita adalah label risiko peringatan, bukan label skor hoaks. Yang dibandingkan adalah hasil rumus peringkat: hoaks × sensitivitas × viralitas efektif.",
        `${bandLabel("kritis")} bila risiko minimal ${percent(BAND_KRITIS_MIN)}. ${bandLabel("prioritas")} bila risiko minimal ${percent(BAND_PRIORITAS_MIN)} dan masih di bawah batas kritis. Di bawah itu, pita ${bandLabel("pantau")}. Di dasbor, saringan memakai nama kritis, prioritas, dan pantau.`,
        `${bandLabel("kritis")}: ${recommendation("kritis")}`,
        `${bandLabel("prioritas")}: ${recommendation("prioritas")}`,
        `${bandLabel("pantau")}: ${recommendation("pantau")}`,
      ],
    },
    {
      id: "model",
      title: "Model linier dan IndoBERT",
      summary: "Skor utama memakai satu mesin, tidak dicampur. Selisih besar yang diperingatkan adalah IndoBERT lawan heuristik, bukan lawan model linier.",
      paragraphs: [
        "IndoBERT on-premise hanya dipanggil bila LOCAL_HOAX_URL terisi. URL itu biasanya mesin analis sendiri. Tidak ada Inference API. Bila URL kosong, statusnya mode ringan: skor dari model n-gram di repo dan heuristik, tanpa panggilan IndoBERT.",
        `Model linier adalah regresi logistik atas n-gram kata dan pasangan kata, berdimensi ${FEATURE_DIM}. Bobotnya disimpan di repo. Ia bukan IndoBERT. Jika berkas bobot tidak ada atau ukurannya tidak cocok, mesin ini dilewati dan skor utama jatuh ke heuristik.`,
        "Heuristik adalah skor leksikal yang alasannya ditampilkan (bahasa sensasi, atribusi lemah, nada rilis resmi, dan pola serupa). Ia bukan keputusan fakta. Skor utama tidak merata-rata ketiga angka itu.",
        `Peringatan selisih membandingkan IndoBERT dengan heuristik, bukan dengan model linier. Bila selisih absolut minimal ${decimal(ENGINE_DIVERGENCE)}, berkas menampilkan: “${ENGINE_DIVERGENCE_WARNING}”. Model linier tetap ditampilkan di sampingnya sebagai keluaran mesinnya sendiri.`,
      ],
    },
    {
      id: "peringkat",
      title: "Rumus peringkat",
      summary: "Risiko = hoaks × sensitivitas topik × viralitas efektif. Dasbor mengurutkan dari risiko tertinggi.",
      paragraphs: [
        `Rumus risiko peringatan dini: hoaks × sensitivitas topik × viralitas efektif. Hoaks di rumus itu adalah skor utama. Viralitas efektif = ${decimal(EFFECTIVE_VIRALITY_FLOOR)} + ${decimal(EFFECTIVE_VIRALITY_SPAN)} × viralitas pada kartu.`,
        "Dasbor mengurutkan peringatan dari risiko tertinggi ke terendah. Pita lalu membaca risiko itu, bukan skor utama secara langsung.",
      ],
    },
    {
      id: "pegangan",
      title: "Pegangan",
      summary: `Nama akun tidak disimpan. Yang tampil hash singkat, atau “${emptyHandle}” bila tidak ada.`,
      paragraphs: [
        "Pegangan adalah nama akun yang menempel pada masukan. Sebelum disimpan, teks itu dipotong spasi, diubah ke huruf kecil, lalu di-hash SHA-256 satu arah bersama garam HANDLE_HASH_SALT. Pegangan mentah tidak disimpan.",
        `Di layar, hash ditampilkan sebagai ${handlePrefix} diikuti ${handleVisible} karakter pertama. Contoh bentuknya ${handleSample}. Jika tidak ada hash, tulisannya “${emptyHandle}”. Di production, garam yang kosong atau lebih pendek dari 8 karakter membuat hash tidak dibuat, jadi tampilannya juga “${emptyHandle}”.`,
      ],
    },
    {
      id: "ontologi",
      title: "Ontologi",
      summary: "Daftar topik narasi militer. Cocok lewat kata kunci atau kemiripan kalimat prototipe. Sensitivitasnya bobot kebijakan.",
      paragraphs: [
        `Ontologi adalah daftar topik narasi militer. Sebuah topik cocok bila ada kata kuncinya, atau bila kemiripan kosinus terhadap kalimat prototipe cukup tinggi. Jika tidak ada kata kunci dan kemiripan di bawah ${percent(TOPIC_SIMILARITY_MIN)}, topik itu dilewati.`,
        "Skor kecocokan adalah yang lebih besar antara bagian kata kunci dan kemiripan kosinus. Bagian kata kunci mencapai 1 bila sedikitnya dua kata kunci kena. Topik diurutkan dari skor tertinggi.",
        `Halaman Ontologi menampilkan bobot, kalimat prototipe, dan kata kunci tiap topik. Bobot saat ini: ${topics}.`,
      ],
    },
    {
      id: "audit",
      title: "Audit",
      summary: "Catatan perubahan status peringatan dan kasus. Hanya admin yang boleh membacanya.",
      paragraphs: [
        `Audit mencatat perubahan status peringatan dan kasus. Log hanya dapat dibaca admin. Fungsi bacanya menolak peran lain dengan pesan bahwa log audit hanya untuk admin. Yang ditampilkan paling baru ${AUDIT_LIST_LIMIT} baris, urutan dari yang terakhir.`,
        "Pada Postgres, pemicu SECURITY DEFINER menulis log yang sama.",
        `Retensi menghapus unggahan demo yang umurnya lebih dari ${DEMO_RETENTION_DAYS} hari dan tidak terhubung ke kasus. Unggahan yang sudah punya kasus tidak dihapus. Tombol retensi hanya ada di halaman audit untuk admin.`,
      ],
    },
  ];
}

export function glossaryTip(id: string): { href: string; label: string; tip: string } {
  const entry = glossaryEntries().find((item) => item.id === id);
  if (!entry) throw new Error(`Istilah tidak dikenal: ${id}`);
  return { href: `/panduan#${entry.id}`, label: entry.title, tip: entry.summary };
}
