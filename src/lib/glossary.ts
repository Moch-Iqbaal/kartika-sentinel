import { MATCH_MIN_SIMILARITY } from "@/lib/factcheck/match";
import { bandLabel, percent, recommendation } from "@/lib/format";
import { MIN_RELIABLE_CHARS, SHORT_TEXT_KEEP, SHORT_TEXT_WARNING } from "@/lib/ingest/short-text";
import { AUDIT_LIST_LIMIT, DEMO_RETENTION_DAYS } from "@/lib/limits";
import { IMAGE_METADATA_DISCLAIMER } from "@/lib/media/metadata";
import {
  AI_CONFIDENCE_SEDANG_MIN,
  AI_CONFIDENCE_TINGGI_MIN,
  AI_SCORE_CAP,
  AI_TEXT_DISCLAIMER,
} from "@/lib/model/ai-confidence";
import { ENGINE_DIVERGENCE, ENGINE_DIVERGENCE_WARNING } from "@/lib/model/classify";
import { FEATURE_DIM } from "@/lib/model/features";
import { NO_TOPIC_SENSITIVITY, TOPIC_SIMILARITY_MIN, TOPICS } from "@/lib/ontology/topics";
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
import { displayHandle } from "@/lib/security/redact";
import { MAX_TEXT_BYTES } from "@/lib/security/ssrf";

/**
 * Judul = kata yang tampil di antarmuka.
 * summary: 1–2 kalimat biasa, tanpa rumus.
 * tip: satu kalimat untuk tanda ⓘ. Kosong berarti sama dengan summary.
 * detail: angka dan rumus, disembunyikan di “Detail teknis”.
 */

export type GlossaryEntry = {
  id: string;
  title: string;
  summary: string;
  tip?: string;
  detail?: string;
};

export type GlossaryGroup = {
  id: string;
  title: string;
  entries: GlossaryEntry[];
};

function decimal(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
}

function count(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

const handleSample = displayHandle("0123456789abcdef");
const emptyHandle = displayHandle(null);

function term(id: string, title: string, summary: string, detail?: string, tip?: string): GlossaryEntry {
  return { id, title, summary, detail, tip };
}

export function glossaryGroups(): GlossaryGroup[] {
  const topicEntries: GlossaryEntry[] = TOPICS.map((topic) =>
    term(
      `topik-${topic.id}`,
      topic.label,
      `${topic.label} adalah topik narasi di daftar ontologi.`,
      `Bobot ${decimal(topic.sensitivity)}. Kata kunci: ${topic.keywords.join(", ")}. Prototipe: “${topic.prototype}”.`,
    ),
  );

  return [
    {
      id: "menu",
      title: "Menu dan kepala halaman",
      entries: [
        term("kartika-sentinel", "Kartika Sentinel", "Nama aplikasinya. Dia bantu hitung indikasi, lalu analis yang memutuskan."),
        term("siber-sosial", "Siber Sosial · TNI", "Meja ini untuk narasi yang menyasar lingkungan TNI."),
        term("pusat-peringatan", "Pusat peringatan dini", "Antrean untuk melihat indikasi lebih awal, sebelum ada sanggahan."),
        term("human-in-the-loop", "human-in-the-loop", "Manusia tetap yang memutuskan. Sistem tidak bertindak sendiri."),
        term("dasbor-menu", "Dasbor", "Menu ke antrean peringatan, diurutkan dari risiko tertinggi."),
        term("analisis-menu", "Analisis", "Menu untuk menempel teks, URL, atau tautan gambar."),
        term("ontologi-menu", "Ontologi", "Menu ke daftar topik narasi dan bobotnya."),
        term("audit-menu", "Audit", "Menu ke log perubahan. Hanya admin yang bisa membukanya."),
        term("panduan-menu", "Panduan Istilah", "Halaman ini. Semua kata di aplikasi dijelaskan di sini, per halaman."),
        term("peran", "admin / analis", "Admin boleh audit dan retensi. Analis mengubah berkas yang ditugaskan kepadanya."),
        term("keluar", "Keluar", "Menutup sesi dan kembali ke halaman masuk."),
        term("info", "ⓘ", "Tanda kecil di kartu skor. Arahkan kursor untuk ringkasannya, klik untuk buka panduan."),
      ],
    },
    {
      id: "masuk",
      title: "Masuk",
      entries: [
        term("hackathon", "Kartika Cyber Hackathon 2026", "Baris kecil di halaman masuk. Menandai ajang tempat meja ini dibuat."),
        term("surel", "Surel", "Alamat surel akun. Wajib diisi."),
        term("sandi", "Sandi", "Kata sandi akun, wajib diisi. Sandi latihan di mode demo bukan rahasia produksi."),
        term("masuk-tombol", "Masuk", "Tombol buka sesi. Saat diproses, tulisannya jadi “Memeriksa sesi…”."),
        term("mode-demo", "Mode demo lokal", "Hanya muncul saat development. Surel dan sandi latihan tertulis di bawah formulir."),
        term("masuk-ditolak", "Masuk ditolak", "Surel atau sandi tidak cocok. Coba periksa lagi."),
      ],
    },
    {
      id: "dasbor",
      title: "Dasbor",
      entries: [
        term("dasbor-peringatan", "Dasbor peringatan", "Judul antrean. Umpan demo di sini data latihan, bukan unggahan sungguhan."),
        term("data-demo", "Data demo", "Tanda bahwa baris itu data latihan, bukan masukan analis."),
        term("peringatan-hitung", "Peringatan", "Kartu jumlah semua peringatan, sebelum disaring."),
        term(
          "pita-kritis-kartu",
          "Pita kritis",
          "Kartu jumlah peringatan di pita paling tinggi.",
          `Pita ${bandLabel("kritis")} mulai risiko ${percent(BAND_KRITIS_MIN)}.`,
        ),
        term("mesin-skor-dasbor", "Mesin skor", "Kartu yang menyebut mesin yang sedang dipakai, mode ringan atau IndoBERT."),
        term(
          "mode-ringan",
          "mode ringan",
          "IndoBERT tidak dipanggil. Skor dari model n-gram dan heuristik, dan ini bukan error.",
          "Muncul bila LOCAL_HOAX_URL kosong.",
        ),
        term("sedang-bangun", "sedang bangun", "IndoBERT sedang nyala atau tunnel baru sambung. Skor sementara pakai model n-gram."),
        term("tersambung", "IndoBERT on-premise tersambung", "Proses IndoBERT menjawab, jadi skor baru bisa memakai mesin itu."),
        term("tidak-tersambung", "tidak tersambung", "Alamat IndoBERT ada, tetapi prosesnya tidak menjawab. Skor jatuh ke cadangan."),
        term("kecepatan-sebaran", "Kecepatan sebaran demo", "Grafik empat peringatan teratas. Garisnya jumlah sebar, bukan skor hoaks."),
        term("langkah", "langkah", "Angka di sumbu grafik. Langkah 1 artinya pengamatan pertama, bukan jam."),
        term("belum-ada-jejak", "Belum ada jejak sebaran pada umpan demo", "Grafik kosong karena belum ada data suka, sebar, atau komentar."),
        term("semua", "Semua", "Tampilkan semua peringatan, tanpa saringan topik atau pita."),
        term(
          "risiko-kolom",
          "Risiko",
          "Angka peringkat di tabel, makin tinggi makin didahulukan.",
          `Risiko = hoaks × sensitivitas × viralitas efektif. Viralitas efektif = ${decimal(EFFECTIVE_VIRALITY_FLOOR)} + ${decimal(EFFECTIVE_VIRALITY_SPAN)} × viralitas.`,
          "Angka peringkat: makin tinggi, makin didahulukan di dasbor.",
        ),
        term(
          "pita",
          "Pita",
          "Label risiko Kritis, Prioritas, atau Pantau, bukan label hoaks.",
          `${bandLabel("kritis")} dari ${percent(BAND_KRITIS_MIN)}. ${bandLabel("prioritas")} dari ${percent(BAND_PRIORITAS_MIN)}. Di bawah itu ${bandLabel("pantau")}.`,
        ),
        term(
          "kritis",
          "Kritis",
          "Pita paling tinggi, perlu ditinjau manusia sebelum ada sanggahan.",
          `Ambang ${percent(BAND_KRITIS_MIN)}. ${recommendation("kritis")}`,
        ),
        term(
          "prioritas",
          "Prioritas",
          "Pita tengah: masuk antrean dan bandingkan dulu dengan rilis resmi.",
          `Ambang ${percent(BAND_PRIORITAS_MIN)}, di bawah kritis. ${recommendation("prioritas")}`,
        ),
        term(
          "pantau",
          "Pantau",
          "Pita rendah, belum jadi alasan eskalasi dan sistem tidak bertindak sendiri.",
          recommendation("pantau"),
        ),
        term("narasi", "Narasi", "Kutipan teks yang dinilai, klik untuk membuka berkas."),
        term("topik-kolom", "Topik", "Topik ontologi yang kena pada teks itu."),
        term("status-kolom", "Status", "Keadaan peringatan (Baru, Ditriase, Dieskalasi, Ditutup), bukan pita risiko."),
        term("baru", "Baru", "Mengembalikan status peringatan ke Baru."),
        term("ditriase", "Ditriase", "Analis sudah melihat berkas, belum menaikkan atau menutupnya."),
        term("dieskalasi", "Dieskalasi", "Berkas dinaikkan untuk ditinjau lagi. Sistem tidak mengirim sanggahan."),
        term("ditutup", "Ditutup", "Peringatan ditutup analis. Bukan berarti klaimnya benar."),
        term(
          "pegangan",
          "Pegangan",
          "Nama akun tidak disimpan, yang tampil hanya potongan hash.",
          `Tampilan ${handleSample}, atau “${emptyHandle}” bila tidak ada hash. Hash SHA-256, pegangan mentah tidak disimpan.`,
        ),
      ],
    },
    {
      id: "analisis",
      title: "Analisis",
      entries: [
        term("analisis-masukan", "Analisis masukan", "Halaman untuk menempel teks, URL, atau tautan gambar. Hasilnya berkas baru."),
        term(
          "teks-tombol",
          "Teks",
          "Mode tempel narasi langsung.",
          "Minimal 12 karakter, maksimal 6000 karakter.",
        ),
        term("url-tombol", "URL", "Mode tautan. YouTube lewat oEmbed, halaman lain harus lolos penjaga SSRF."),
        term(
          "gambar-tombol",
          "Gambar",
          "Mode tautan gambar. Yang dibaca metadata, bukan pikselnya.",
          "Hanya JPEG, PNG, atau WebP, maksimal 2 MB.",
        ),
        term(
          "ssrf",
          "Penjaga SSRF",
          "Penjaga agar tautan tidak mengarah ke jaringan dalam atau tipe berkas yang tidak diizinkan.",
          `Hanya http/https port 80 dan 443, tanpa kredensial, paling banyak 2 redirect. HTML di atas ${count(MAX_TEXT_BYTES)} byte dipotong, tidak ditolak.`,
        ),
        term("analisis-tombol", "Analisis", "Tombol kirim. Saat menunggu, cold start model bisa sekitar satu menit, lalu cadangan dipakai."),
        term("rekomendasi-saja", "Sistem hanya merekomendasikan", "Kalimat tetap di beberapa halaman: putusan ada pada analis, skor bukan penetapan."),
        term("kartu-model", "umn-cyber/indobert-hoax", "Nama model yang disebut di disclaimer. Akurasinya milik penulis model, bukan uji aplikasi ini."),
      ],
    },
    {
      id: "berkas",
      title: "Berkas peringatan",
      entries: [
        term("kembali", "Kembali ke dasbor", "Tautan kembali ke antrean, tanpa mengubah status."),
        term("masukan-analis", "Masukan analis", "Berkas ini dari teks, URL, atau gambar yang ditempel analis, bukan data demo."),
        term("berkas-peringatan", "Berkas peringatan", "Satu halaman untuk teks, skor, topik, padanan, dan tindakan analis."),
        term(
          "skor-utama",
          "Skor utama",
          "Perkiraan peluang hoaks dari satu mesin. Makin tinggi, makin mirip hoaks, dan bukan penetapan.",
          `Teks URL di bawah ${MIN_RELIABLE_CHARS} karakter: jarak ke 0,5 dikalikan ${decimal(SHORT_TEXT_KEEP)}. Peringatan: “${SHORT_TEXT_WARNING}”.`,
          "Perkiraan peluang hoaks: makin tinggi, makin mirip hoaks, bukan penetapan.",
        ),
        term(
          "sensitivitas",
          "Sensitivitas",
          "Seberapa peka topiknya bagi peringkat TNI. Tinggi berarti topik rawan, rendah berarti netral.",
          `Tanpa topik, lantai ${percent(NO_TOPIC_SENSITIVITY)}. Bukan statistik operasi.`,
          "Seberapa peka topiknya: tinggi berarti rawan, rendah berarti netral.",
        ),
        term(
          "viralitas",
          "Viralitas",
          "Seberapa cepat konten menyebar dari data suka dan sebar. 0% berarti data itu tidak ada.",
          `Viralitas efektif = ${decimal(EFFECTIVE_VIRALITY_FLOOR)} + ${decimal(EFFECTIVE_VIRALITY_SPAN)} × viralitas. Engagement = sebar + ${decimal(VIRALITY_LIKE_WEIGHT)} × suka + ${decimal(VIRALITY_COMMENT_WEIGHT)} × komentar. Langit ${count(VIRALITY_ENGAGEMENT_CEILING)} dan ${count(VIRALITY_VELOCITY_CEILING)}, bobot ${decimal(VIRALITY_ENGAGEMENT_WEIGHT)} dan ${decimal(VIRALITY_VELOCITY_WEIGHT)}, jarak minimal ${decimal(VIRALITY_MIN_HOURS)} jam.`,
          "Kecepatan sebar: 0% berarti tidak ada data engagement, bukan bukti tidak viral.",
        ),
        term(
          "viralitas-efektif",
          "viralitas efektif",
          "Angka sebaran yang dipakai rumus risiko, supaya konten baru tidak langsung jatuh ke nol.",
          `${decimal(EFFECTIVE_VIRALITY_FLOOR)} + ${decimal(EFFECTIVE_VIRALITY_SPAN)} × viralitas pada kartu.`,
        ),
        term(
          "media-ai",
          "Media AI",
          "Isyarat gaya tulisan dan metadata. Bukan deteksi deepfake, dan bukan bukti tulisan manusia.",
          AI_TEXT_DISCLAIMER,
          "Isyarat gaya dan metadata, bukan bukti deepfake atau tulisan manusia.",
        ),
        term(
          "indikasi",
          "Indikasi / Tidak menonjol",
          "“Indikasi” berarti sinyalnya cukup kuat. “Tidak menonjol” berarti sinyalnya lemah.",
        ),
        term(
          "keyakinan-ai",
          "Keyakinan indikasi AI",
          "Seberapa kuat isyarat AI-nya. Rendah artinya sinyal lemah, bukan bukti tulisan manusia.",
          `Tinggi dari ${percent(AI_CONFIDENCE_TINGGI_MIN)}, sedang dari ${percent(AI_CONFIDENCE_SEDANG_MIN)}, selain itu rendah. Skor dijepit ${percent(AI_SCORE_CAP)}.`,
        ),
        term("metadata-gambar", "Metadata gambar", "Pemeriksaan byte gambar, bukan isi pikselnya.", IMAGE_METADATA_DISCLAIMER),
        term("teks-dinilai", "Teks yang dinilai", "Teks yang benar-benar masuk mesin. Pada URL, ini judul plus tubuh artikel."),
        term("versi", "Versi", "Nama versi mesin yang menghasilkan skor utama."),
        term(
          "indobert",
          "IndoBERT on-premise",
          "Mesin utama bila prosesnya hidup di mesin analis. Tidak dicampur dengan mesin lain.",
          "Hanya dipanggil bila LOCAL_HOAX_URL terisi. Bukan Inference API.",
        ),
        term(
          "model-linier",
          "Model linier",
          "Cadangan model n-gram di repo, bukan IndoBERT. “Mentah” artinya angka sebelum diturunkan.",
          `Dimensi fitur ${FEATURE_DIM}.`,
        ),
        term("heuristik", "Heuristik", "Skor dari pola kata, plus alasannya. Dipakai sebagai skor utama hanya bila model linier tidak ada."),
        term(
          "selisih-mesin",
          "IndoBERT dan heuristik berselisih jauh",
          "Dua mesin tidak sepakat. Baca keduanya, jangan andalkan satu angka.",
          `Selisih minimal ${decimal(ENGINE_DIVERGENCE)} antara IndoBERT dan heuristik, bukan lawan model linier. “${ENGINE_DIVERGENCE_WARNING}”`,
        ),
        term(
          "topik-berkas",
          "Topik",
          "Topik yang kena pada teks ini, beserta kata yang cocok.",
          `Tanpa kata kunci, kemiripan minimal ${percent(TOPIC_SIMILARITY_MIN)}.`,
        ),
        term(
          "padanan",
          "Padanan cek fakta",
          "Cek fakta lokal yang mirip dengan teks ini, bukan putusan sistem.",
          `Maksimal 5, kemiripan minimal ${percent(MATCH_MIN_SIMILARITY)}.`,
        ),
        term("vonis", "Hoaks / Menyesatkan / Benar / Belum terverifikasi", "Label pada padanan cek fakta, bukan putusan sistem."),
        term("fact-check-tools", "Fact Check Tools", "Padanan dari luar, bila kunci API terisi. “Tautan” membuka sumbernya."),
        term("tindakan", "Tindakan analis", "Tempat ubah status, buka kasus, skor ulang, unduh PDF, dan tulis catatan."),
        term("triase-tombol", "Triase", "Menandai peringatan sudah dilihat, statusnya jadi Ditriase."),
        term("eskalasi-tombol", "Eskalasi", "Menaikkan berkas untuk ditinjau lagi, tanpa mengirim pesan ke luar."),
        term("tutup-peringatan", "Tutup peringatan", "Menutup peringatan tanpa menghapus berkas."),
        term("buka-kasus", "Buka kasus", "Membuat kasus dari peringatan ini."),
        term("kasus-terbuka", "Kasus terbuka", "Menandai kasus sudah dibuka dan belum diselidiki."),
        term("diselidiki", "Diselidiki", "Menandai kasus sedang diperiksa analis."),
        term("tutup-kasus", "Tutup kasus", "Menutup kasus tanpa menghapus peringatannya."),
        term("skor-ulang", "Skor ulang", "Menghitung ulang teks tersimpan, tanpa mengubah data sebaran."),
        term("unduh-pdf", "Unduh PDF", "Mengunduh ringkasan berkas, tetap rekomendasi bukan penetapan."),
        term(
          "catatan",
          "Catatan analis",
          "Catatan manusia untuk temuan atau alasan eskalasi.",
          "Maksimal 2000 karakter.",
        ),
        term("linimasa", "Linimasa", "Jejak waktu terbit, sebaran, dan perubahan status."),
        term("ditugaskan", "Berkas ini ditugaskan ke analis lain", "Anda bisa membaca, tetapi tidak bisa mengubah. Admin tetap bisa."),
        term(
          "teks-pendek",
          SHORT_TEXT_WARNING,
          "Tubuh artikel terlalu pendek, jadi skornya jangan dipercaya mentah-mentah.",
          `Di bawah ${MIN_RELIABLE_CHARS} karakter. Jarak skor ke 0,5 dikalikan ${decimal(SHORT_TEXT_KEEP)}.`,
        ),
      ],
    },
    {
      id: "ontologi",
      title: "Ontologi",
      entries: [
        term(
          "ontologi-narasi",
          "Ontologi narasi",
          "Daftar topik narasi militer. Sensitivitasnya bobot kebijakan, bukan statistik operasi.",
        ),
        term(
          "kata-kunci",
          "Kata kunci",
          "Kata yang membuat sebuah topik kena.",
          "Dua kata kunci atau lebih mengisi penuh bagian kata kunci pada skor kecocokan.",
        ),
        term("bobot-topik", "Bobot topik", "Bobot 0–1: makin tinggi, topik makin rawan bagi TNI dan peringatan naik di peringkat.", `Lantai bila tidak ada topik: ${percent(NO_TOPIC_SENSITIVITY)}.`),
        term("peringatan-dasbor", "Peringatan pada dasbor", "Jumlah peringatan di dasbor yang masuk topik ini."),
        ...topicEntries,
      ],
    },
    {
      id: "audit",
      title: "Audit",
      entries: [
        term(
          "log-audit",
          "Log audit",
          "Catatan perubahan status. Hanya admin yang boleh membaca.",
          `${AUDIT_LIST_LIMIT} baris terbaru. Di Postgres, pemicu SECURITY DEFINER menulis log yang sama.`,
        ),
        term(
          "retensi",
          "Jalankan retensi 90 hari",
          "Tombol admin untuk menghapus data demo lama yang tidak punya kasus.",
          `Lebih dari ${DEMO_RETENTION_DAYS} hari, dan tidak terhubung ke kasus.`,
        ),
        term("kolom-audit", "Waktu / Tabel / Aksi / Aktor / Perubahan", "Kolom log: kapan, di tabel mana, apa yang berubah, dan siapa pelakunya."),
        term("belum-ada-catatan", "Belum ada catatan", "Log masih kosong, atau Anda bukan admin."),
      ],
    },
    {
      id: "pesan",
      title: "Pesan yang tampil",
      entries: [
        term("tidak-ada-sesi", "Tidak ada sesi analis", "Sesi habis atau belum masuk. Masuk lagi."),
        term("origin-ditolak", "Origin ditolak", "Permintaan datang dari halaman yang bukan aplikasi ini."),
        term(
          "batas-analisis",
          "Batas analisis tercapai",
          "Terlalu banyak analisis dalam waktu singkat. Tunggu sebentar.",
          "15 analisis per akun dalam 10 menit. Skor ulang pesannya “Terlalu sering.”, batasnya terpisah.",
        ),
        term("terlalu-banyak", "Terlalu banyak percobaan", "Terlalu sering mencoba masuk.", "20 percobaan dalam 10 menit."),
        term(
          "badan-besar",
          "Badan permintaan terlalu besar",
          "Data yang dikirim dari formulir terlalu besar.",
          "Batas permintaan analisis 32 KB. Bukan batas unduhan halaman berita.",
        ),
        term(
          "teks-pendek-api",
          "Teks terlalu pendek",
          "Narasi yang ditempel terlalu sedikit untuk dinilai.",
          `Mode Teks menolak di bawah 12 karakter. Tubuh URL di bawah ${MIN_RELIABLE_CHARS} karakter tetap dinilai, tetapi keyakinannya diturunkan.`,
        ),
        term("teks-panjang", "Teks terlalu panjang", "Narasi yang ditempel melewati batas mode Teks.", "Maksimal 6000 karakter."),
        term("tidak-ada-teks", "Tidak ada teks yang bisa dinilai", "Setelah diambil, tidak ada teks yang tersisa untuk dinilai."),
        term("url-tidak-valid", "URL tidak valid", "Tautannya tidak bisa dibaca sebagai URL.", "Panjang yang diterima 8 sampai 2000 karakter."),
        term("skema", "Hanya http dan https yang diizinkan", "Tautan selain http atau https ditolak."),
        term("kredensial-url", "URL dengan kredensial ditolak", "Tautan yang memuat nama atau sandi di dalamnya tidak diikuti."),
        term("port", "Hanya port 80 dan 443 yang diizinkan", "Port lain ditolak."),
        term("host-lokal", "Host lokal ditolak", "Alamat mesin sendiri, seperti localhost, tidak boleh diambil."),
        term("ip-privat", "Alamat IP privat atau metadata ditolak", "Alamat jaringan dalam dan metadata awan tidak diikuti."),
        term("host-gagal", "Nama host tidak dapat diselesaikan", "Nama situs tidak ketemu di DNS."),
        term("host-diblokir", "Host mengarah ke alamat yang diblokir", "Namanya sah, tetapi alamat IP-nya mengarah ke jaringan yang ditolak."),
        term("redirect", "Redirect tanpa tujuan / Terlalu banyak redirect", "Arahannya putus, atau lompatannya terlalu banyak.", "Paling banyak 2 redirect. Setiap tujuan dicek lagi."),
        term("http-sumber", "Sumber menjawab HTTP …", "Situs tujuan menolak atau tidak ketemu. Nomor statusnya disebut di pesan."),
        term("tipe-konten", "Tipe konten tidak diizinkan", "Jenis berkasnya tidak masuk daftar yang boleh diambil."),
        term("bukan-gambar", "Berkas bukan JPEG, PNG, atau WebP", "Mode gambar hanya menerima ketiga jenis itu."),
        term("gambar-besar", "Gambar melebihi 2 MB", "Gambar di atas batas itu ditolak. Halaman HTML yang besar dipotong, tidak ditolak."),
        term("analisis-gagal", "Analisis gagal diproses", "Ada gangguan di server, bukan penolakan tautan. Coba lagi."),
        term("skor-ulang-gagal", "Skor ulang gagal", "Penghitungan ulang tidak selesai. Kalau pesannya soal hak, akun ini tidak boleh mengubah berkas itu."),
        term("retensi-admin", "Retensi hanya untuk admin", "Analis tidak bisa menjalankan retensi."),
        term("tidak-ditemukan", "Peringatan tidak ditemukan", "Berkas dengan identitas itu tidak ada."),
      ],
    },
  ];
}

export function glossaryEntries(): GlossaryEntry[] {
  return glossaryGroups().flatMap((group) => group.entries);
}

function oneSentence(text: string): string {
  const cut = text.split(/(?<=[.!?])\s+/)[0];
  return cut || text;
}

export function glossaryTip(id: string): { href: string; label: string; tip: string } {
  const entry = glossaryEntries().find((item) => item.id === id);
  if (!entry) throw new Error(`Istilah tidak dikenal: ${id}`);
  return { href: `/panduan#${entry.id}`, label: entry.title, tip: oneSentence(entry.tip ?? entry.summary) };
}
