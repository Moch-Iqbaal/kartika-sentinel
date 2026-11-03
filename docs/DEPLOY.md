# Deploy web: Vercel dan Supabase

Web berjalan di Vercel. Tanpa `LOCAL_HOAX_URL`, situs memakai **mode ringan** (model n-gram di repo dan heuristik). IndoBERT tidak ikut di Vercel. Jalur skor penuh adalah proses di Mac pemilik, lewat tunnel HTTPS gratis, dijelaskan di [ONPREM.md](ONPREM.md).

Jangan mengirim kunci ke git. Nama variabel ada di `.env.example`. Kuota gratis Vercel dan Supabase bisa berubah; baca angka di konsol sebelum deploy.

## 1. Supabase

1. Buat proyek di organisasi gratis.
2. Buka SQL Editor. Jalankan berurutan `supabase/migrations/0001_init.sql`, `supabase/migrations/0002_analyst_notes.sql`, lalu `supabase/migrations/0003_hardening.sql`.
3. Di Authentication, buat satu pengguna email untuk analis dan satu untuk admin. Kata sandi dipilih pemilik akun.
4. Salin UUID pengguna dari tabel `auth.users`.
5. Jalankan, dengan UUID dan email yang nyata:

```sql
insert into public.analysts (id, email, role)
values
  ('UUID-ANALIS', 'email-analis', 'analyst'),
  ('UUID-ADMIN', 'email-admin', 'admin');
```

6. Dari Project Settings, salin Project URL, anon key, dan service role key.
7. Service role hanya untuk environment server. Jangan membuat variabel `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.

Tanpa langkah ini, web tetap jalan dengan SQLite di laptop. Vercel tanpa kunci Supabase hanya punya disk sementara.

## 2. Vercel untuk web

1. Impor repositori ini sebagai proyek Next.js.
2. Untuk mode ringan, jangan isi `LOCAL_HOAX_URL` dan `LOCAL_MODEL_TOKEN`. Dasbor akan bertuliskan mode ringan.
3. Untuk IndoBERT on-premise, jalankan `./scripts/start-onprem.sh` di Mac dan tempel dua baris yang dicetak. Lihat [ONPREM.md](ONPREM.md).
4. Isi environment Production yang lain, tanpa mengutip nilai di dokumen:

| Nama | Isi |
| --- | --- |
| `SUPABASE_URL` | URL proyek |
| `SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role |
| `NEXT_PUBLIC_SUPABASE_URL` | URL yang sama, untuk sesi peramban |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SESSION_SECRET` | string acak minimal 32 karakter |
| `HANDLE_HASH_SALT` | string acak |
| `LOCAL_HOAX_URL` | kosong untuk mode ringan, atau `https://….trycloudflare.com/classify` |
| `LOCAL_MODEL_TOKEN` | kosong untuk mode ringan, atau token yang sama dengan Mac |
| `DEMO_MODE` | `false` |

5. Deploy. Buka situs, masuk dengan pengguna Supabase, tempel satu teks.
6. Mode ringan langsung memakai n-gram. Jika URL on-premise diisi tetapi Mac masih memuat bobot, halaman menampilkan sedang bangun dan skor sementara tetap dari n-gram.

## 3. Opsional: Cloud Run

Bagian ini tidak dipakai sebagai jalur utama. Ia tetap ada bila suatu saat ada kuota Google Cloud tanpa kartu. Image membangun torch CPU dan mengunduh bobot publik saat build.

```bash
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
export LOCAL_MODEL_TOKEN="$(openssl rand -hex 32)"
echo "Simpan token ini di pengelola sandi. Jangan tempel ke git."
gcloud run deploy kartika-hoax \
  --source . \
  --region REGION_YANG_GRATIS \
  --memory 2Gi \
  --cpu 1 \
  --concurrency 1 \
  --timeout 90 \
  --min-instances 0 \
  --allow-unauthenticated \
  --set-env-vars "LOCAL_MODEL_TOKEN=${LOCAL_MODEL_TOKEN},HOAX_BIND_HOST=0.0.0.0"
```

`--min-instances 0` membuat instance tertidur. `--concurrency 1` menjaga satu permintaan pada memori 2 GiB. `--allow-unauthenticated` membuat URL bisa dihubungi Vercel. Klasifikasi tetap menolak permintaan tanpa header `x-kartika-model-token`.

Pilih region setelah melihat harga dan kuota di konsol. Jangan menganggap satu region selalu gratis.

Setelah deploy, salin URL `https://....a.run.app`.

Uji:

```bash
curl -s "https://URL/health"
curl -s -X POST "https://URL/classify" \
  -H "content-type: application/json" \
  -H "x-kartika-model-token: $LOCAL_MODEL_TOKEN" \
  -d '{"text":"Sebarkan klaim ini sekarang juga."}'
```

Permintaan pertama bisa lama karena image ditarik dan bobot dimuat. `/health` boleh menjawab `"ready": false` selama itu. `/classify` memuat model di dalam permintaan.

## 4. Laptop, mode ringan

```bash
npm install
npm test
npm run dev
```

Tanpa `LOCAL_HOAX_URL`, dasbor lokal juga mode ringan. IndoBERT di Mac ada di [ONPREM.md](ONPREM.md): `./scripts/start-onprem.sh`.

## Opsional: VM lain

Bukan jalur utama. `docker-compose.yml` tetap ada bila ada VM Linux. Web menolak HTTP ke host publik, jadi URL yang diisi di Vercel harus HTTPS, dengan `LOCAL_MODEL_TOKEN` yang sama. Di Mac, pakai [ONPREM.md](ONPREM.md), bukan Compose.

```bash
git clone URL_REPO
cd kartika-sentinel
export LOCAL_MODEL_TOKEN="$(openssl rand -hex 32)"
docker compose up --build -d
```

`docker-compose.yml` memetakan port 8080. Web Vercel menolak `http://` ke alamat publik, jadi VM ini butuh HTTPS. Pasang Caddy atau tunnel yang memberi URL `https://...`, lalu isi `LOCAL_HOAX_URL` dengan URL itu ditambah `/classify`. Token lingkungan VM dan Vercel harus sama.

Image tetap mengunduh bobot saat build. Bangun image di VM, bukan di jaringan yang memblokir Hugging Face.

## Uji otomatis

`npm test` tidak membutuhkan cloud. Workflow `.github/workflows/ci.yml` membangun web, menyalakan server dengan SQLite, lalu menjalankan satu jalur: masuk, analisis, berkas, PDF, dan penolakan URL metadata.
