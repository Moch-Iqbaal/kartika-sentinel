# Tur kode

Bacaan ini mengikuti alur satu permintaan analis. Tujuannya supaya pemilik repositori bisa menjelaskan tiap berkas dengan kalimat sendiri.

## Pintu masuk

`src/proxy.ts` berjalan sebelum halaman. Ia membuka cookie `ks_session`. Tanpa sesi, `/api` menjawab 401 dan halaman lain diarahkan ke `/login`. Tiga jalur dibiarkan terbuka: login, logout, dan `/api/health`.

`src/lib/auth/token.ts` menandatangani sesi dengan HMAC. Cookie `httpOnly` dan `SameSite=Lax`. Di production cookie ditandai `Secure`, kecuali `COOKIE_SECURE=false` untuk uji HTTP di mesin sendiri.

`src/lib/auth/demo-users.ts` hanya mengizinkan sandi bawaan saat bukan production, atau saat `DEMO_MODE=true` dan sandi diisi lewat environment. Supabase yang terkonfigurasi mematikan akun demo kecuali mode demo dipaksa.

`src/app/login/page.tsx` menampilkan formulir. Petunjuk sandi demo hanya muncul di development.

## Analisis

`src/app/api/analisis/route.ts` menolak origin yang tidak sama dengan host, membatasi 15 permintaan per 10 menit, dan menolak badan lebih dari 32 KB.

Tiga jenis masukan:

- `text` langsung dinilai.
- `url` diambil lewat `src/lib/ingest/url-text.ts`. YouTube memakai oEmbed. Halaman lain hanya judul dan deskripsi.
- `gambar` diambil sebagai JPEG, PNG, atau WebP, lalu metadata-nya dibaca.

`src/lib/security/ssrf.ts` menolak skema selain http/https, port selain 80 dan 443, kredensial di URL, serta IP loopback, privat, link-local, dan metadata. Setiap redirect diperiksa ulang.

`src/lib/security/untrusted.ts` membuang karakter kendali dan memotong panjang. Teks itu data untuk pengklasifikasi, bukan perintah alat.

`src/lib/security/redact.ts` menyamarkan nomor ponsel, 16 digit yang berbentuk NIK, dan pola alamat sebelum teks disimpan. Pegangan akun di-hash dengan garam.

## Skor

`src/lib/analyze/score.ts` menyusun kartu skor: teks bersih, penilaian hoaks, topik, risiko, dan padanan cek fakta.

`src/lib/model/local-indobert.ts` menentukan boleh tidaknya URL model. `LOCAL_HOAX_URL` kosong berarti mode ringan dan tidak ada panggilan. Loopback boleh HTTP. Host lain wajib HTTPS dan `LOCAL_MODEL_TOKEN`. Waktu tunggu jarak jauh bawaan 60 detik. Kegagalan pada host jarak jauh ditandai `bangun`, lalu skor jatuh ke model n-gram.

`src/lib/model/linear.ts` membaca bobot n-gram yang dilatih `scripts/train-linear.ts`.

`src/lib/model/heuristic.ts` menaikkan skor bila ada ajakan sebar atau angka besar tanpa sumber, dan menurunkannya bila ada nada rilis resmi.

`src/lib/ontology/topics.ts` mencocokkan kata kunci dan kosinus ke kalimat prototipe. Sensitivitas adalah bobot kebijakan, bukan statistik lapangan.

`src/lib/factcheck/match.ts` mengurutkan korpus dengan kosinus embedding 128 dimensi.

`src/lib/factcheck/google.ts` hanya berjalan bila ada kunci. Tanpa kunci, ia mengembalikan daftar kosong.

## Bendera AI

`src/lib/model/stylometry.ts` mengukur kerataan panjang kalimat dan pengulangan kata. Hasilnya disebut sinyal gaya.

`src/lib/model/ai-text.ts` menggabungkan sinyal itu dengan frasa seperti "buatan AI". Keyakinan dibagi rendah, sedang, dan tinggi. Ambang sedang tidak berarti teks itu palsu.

`src/lib/media/metadata.ts` memindai byte gambar untuk nama perangkat lunak dan rangkaian `c2pa` atau `jumbf`. Tidak ada pemeriksaan piksel dan tidak ada verifikasi tanda tangan.

## Penyimpanan

`src/lib/db/index.ts` adalah satu-satunya pintu yang dipanggil halaman. Ia memilih `store.ts` (SQLite) atau `supabase-store.ts`.

`src/lib/db/store.ts` membuat tabel, mengisi benih demo, dan menulis log audit pada perubahan status.

`src/lib/db/supabase-admin.ts` membuat klien service role. Berkas itu mengimpor `server-only`, jadi bundel peramban tidak boleh memakainya.

`src/lib/db/ids.ts` mengubah id teks korpus menjadi UUID stabil agar muat di kolom Postgres.

`supabase/migrations/0001_init.sql` menyalakan RLS, fungsi `is_admin` dan `is_analyst`, pemicu audit, `match_fact_checks`, dan `purge_old_data`. `0002_analyst_notes.sql` menambah kolom catatan.

## Tampilan

`src/app/(console)/page.tsx` adalah dasbor. Kosong, gagal memuat, dan model yang sedang bangun punya kalimatnya sendiri.

`src/app/(console)/kasus/[id]/page.tsx` menunjukkan skor, padanan, linimasa, dan catatan.

`src/components/case-actions.tsx` mengirim perubahan status dan catatan ke API. Tombol skor ulang memanggil IndoBERT lagi.

`src/lib/export/pdf.ts` menyusun PDF: kepala, skor, bukti, padanan, linimasa, catatan, rekomendasi.

## Layanan model

`services/hoax/server.py` memuat bobot hanya dari disk (`local_files_only`). `/health` menjawab cepat. `/classify` memuat model di dalam permintaan bila belum siap, lalu menolak bila token salah. Bila proses diikat ke alamat selain loopback, token wajib ada atau proses berhenti.

`Dockerfile` memasang torch dari indeks CPU, mengunduh bobot publik saat build, dan tidak menyalin `node_modules`.

`scripts/fetch_indobert.py` adalah unduhan tanpa token. Ia juga dipanggil dari dalam image.
