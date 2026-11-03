# Deploy gratis: Vercel, Supabase, Cloud Run

Tiga akun yang perlu dibuat pemilik repositori. Jangan mengirim kunci itu ke git. Nama variabel ada di `.env.example`.

Kuota gratis bisa berubah. Sebelum menekan deploy, baca angka yang tertulis di konsol masing-masing layanan. Dokumen ini tidak menambahkan angka kuota di luar yang diminta untuk bentuk layanan: Cloud Run CPU, memori 2 GiB, scale-to-zero.

## 1. Supabase

1. Buat proyek di organisasi gratis.
2. Buka SQL Editor. Jalankan isi `supabase/migrations/0001_init.sql`, lalu `supabase/migrations/0002_analyst_notes.sql`.
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

## 2. Cloud Run untuk IndoBERT

Perlu Google Cloud CLI yang sudah login, dan proyek dengan penagihan yang masih di dalam kuota gratis. Image membangun torch CPU dan mengunduh bobot publik saat build. Bangun di Cloud Build, bukan di laptop yang memblokir huggingface.co.

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

## 3. Vercel untuk web

1. Impor repositori ini sebagai proyek Next.js.
2. Isi environment Production, tanpa mengutip nilai di dokumen:

| Nama | Isi |
| --- | --- |
| `SUPABASE_URL` | URL proyek |
| `SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role |
| `NEXT_PUBLIC_SUPABASE_URL` | URL yang sama, untuk sesi peramban |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SESSION_SECRET` | string acak minimal 32 karakter |
| `HANDLE_HASH_SALT` | string acak |
| `LOCAL_HOAX_URL` | `https://URL/classify` |
| `LOCAL_MODEL_TOKEN` | token yang sama dengan Cloud Run |
| `MODEL_TIMEOUT_MS` | `60000` |
| `DEMO_MODE` | `false` |

3. Deploy. Buka situs, masuk dengan pengguna Supabase, tempel satu teks.
4. Jika model masih tidur, halaman menampilkan bahwa layanan sedang bangun dan skor memakai model linier. Ulangi setelah `/health` berisi `"ready": true`.

## 4. Laptop

```bash
npm install
python3 -m pip install "torch==2.15.0+cpu" --index-url https://download.pytorch.org/whl/cpu
python3 -m pip install -r services/hoax/requirements.txt
python3 scripts/fetch_indobert.py
python3 services/hoax/server.py
npm run dev
```

Proses model di laptop terikat `127.0.0.1` dan tidak mewajibkan token. Web di `http://127.0.0.1:43123`.

## Alternatif: Oracle Cloud Always Free

Pakai ini bila Cloud Run tidak tersedia. Di konsol Oracle, buat VM yang berlabel Always Free. Pasang Docker dan plugin Compose.

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
