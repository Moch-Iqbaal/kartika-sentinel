# Model ancaman

Kartika Sentinel adalah alat triase untuk analis yang sudah masuk. Ia bukan sensor internet dan bukan alat untuk memetakan orang.

## Aset

- Teks dan URL yang ditempel analis.
- Skor, catatan analis, dan log perubahan status.
- Kunci `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `HANDLE_HASH_SALT`, dan `LOCAL_MODEL_TOKEN`.
- Bobot model di image. Bobot itu publik, tetapi endpoint klasifikasi tidak boleh terbuka tanpa token.

## Pelaku yang dipertimbangkan

- Pengunjung tanpa sesi.
- Analis yang mencoba mengubah berkas analis lain.
- Seseorang yang menempel URL ke alamat internal atau metadata cloud.
- Seseorang yang membaca token bila layanan model dipasang dengan HTTP di internet.

## Batas yang sudah dipasang

| Ancaman | Yang dilakukan kode |
| --- | --- |
| Memanggil API tanpa masuk | `src/proxy.ts` dan `requireSession` menjawab 401 |
| Cookie dicuri skrip halaman | Cookie `httpOnly`, dan `Secure` di HTTPS |
| Kunci service role ikut ke peramban | Hanya dibaca di `supabase-admin.ts` yang `server-only`, tanpa awalan `NEXT_PUBLIC_` |
| URL ke 169.254.169.254, 127.0.0.1, atau 10/8 | `ssrf.ts` menolak bentuk URL dan hasil DNS |
| Body sangat besar | Batas 32 KB di analisis dan 2 MB di gambar |
| Model publik tanpa rahasia bersama | Bind di luar loopback menolak hidup tanpa `LOCAL_MODEL_TOKEN`. Web menolak HTTP ke host publik |
| Teks berisi nomor atau NIK tampil di dasbor | `redact.ts` sebelum simpan |
| Analis mengubah berkas orang lain | `canMutate` menolak bila `assigned_to` terisi dan bukan dirinya. Admin boleh |
| Prompt injection ke alat | Tidak ada tool-calling. Teks hanya field klasifikasi |

RLS Postgres menolak peran `anon`. Kebijakan `authenticated` hanya membaca bagi analis dan hanya mengubah peringatan atau kasus yang ditugaskan, atau bila `is_admin()`. Penulisan pipeline dari server memakai service role, yang melewati RLS, setelah sesi diperiksa di aplikasi. Karena itu service role tidak boleh berada di klien.

## Yang tidak dilindungi alat ini

- Analis yang sah menyalin teks ke luar sistem.
- Metadata gambar yang kebetulan memuat kata "Stable Diffusion" di dalam piksel atau keterangan. Sinyal itu dijelaskan sebagai pemindaian byte, bukan vonis.
- Cold start yang gagal. Web lalu memakai model linier dan menulis status `bangun` atau `mati`. Itu degradasi, bukan kegagalan diam-diam.
- Kebocoran bila `LOCAL_MODEL_TOKEN` dikirim ke URL HTTP publik. Kode menolak pola itu. Jangan mematikan pemeriksaan itu.

## Retensi

`purge_old_data` di SQL dan tombol retensi admin menghapus unggahan demo yang lebih tua dari 90 hari dan tidak terikat kasus. Catatan pada kasus yang masih terbuka tidak ikut terhapus lewat jalur itu.
