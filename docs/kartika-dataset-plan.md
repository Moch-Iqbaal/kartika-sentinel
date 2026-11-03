# Rencana diversifikasi data IndoBERT — Kartika Sentinel

**Tanggal riset:** 3 Nov 2026 (WIB)  
**Status:** riset + rencana saja. **Belum ada retrain, belum hapus apa pun, belum ubah repo.**  
**Deadline submit:** 15 Nov 2026.

Model sekarang: `umn-cyber/indobert-hoax` (IndoBERT `indobenchmark/indobert-base-p1` yang di-fine-tune). Label di server Kartika: **FAKTA=0, HOAX=1**. Dataset pasangan resmi di HF: `umn-cyber/mafindo-2024` (MIT) — campuran berita resmi (Tempo, Kompas, dll.) + hoaks dari CekFakta/Mafindo. Masalah yang keliatan di tes Tribunnews: gaya berita formal masih sering kebaca mirip hoaks (false positive tinggi).

---

## 1) Dataset yang diverifikasi (URL kebuka)

Semua URL di bawah dicek buka halaman (HTTP 200 via fetch/curl, kecuali dicatat). **Angka yang gak tertulis di sumber gak digarang.**

### A. Dataset labeled hoaks / fakta (utama)

| # | Nama | URL | Ukuran (terverifikasi) | Label | Lisensi | Rentang / catatan | Status URL |
|---|------|-----|------------------------|-------|---------|-------------------|------------|
| 1 | **umn-cyber/mafindo-2024** (sudah dipakai model sekarang) | https://huggingface.co/datasets/umn-cyber/mafindo-2024 | **29.552** baris (`all.csv`); train 23.641 / test 5.911. Balance: **HOAX(`is_hoax=1`)=14.057**, **FAKTA(`0`)=15.495**. 277 MB di card. | `title`, `content`, `is_hoax` (0/1) | **MIT** (card README) | Hoaks dari CekFakta/Mafindo; fakta dari media kredibel (Tempo, Kompas, dll.). Tahun spesifik per-artikel **tidak** ditulis di card; sampel konten mencakup isu ~2018–2024. | 200 |
| 2 | **nlp-brin-id/fakenews-mafindo** | https://huggingface.co/datasets/nlp-brin-id/fakenews-mafindo | Card: **10K–100K**; file total **19,5 MB**. Exact row count **tidak** dipublish di halaman (CSV resolve butuh auth → 401). | `HOAX=1` / `NON-HOAX=0`; Title, Content, Fact, References, Classification (fine-grained) | **MIT** (HF cardData) | TurnBackHoax / Mafindo **2018–2023**. Beta; NON-HOAX domain-specific kurang. Maintainer arahkan ke BRIN Dataverse terbaru. | 200 (halaman); unduh file gated |
| 3 | **nlp-brin-id/id-hoax-report-merge** | https://huggingface.co/datasets/nlp-brin-id/id-hoax-report-merge | Card: **10K–100K**; usedStorage API ~303 MB; file page **24,7 MB**. Exact rows **tidak** di card (CSV 401). | HOAX/NON-HOAX + fine-grained (DISINFORMASI, MISINFORMASI, BENAR, dll.) + `Datasource` | **MIT** | Gabungan: turnbackhoax.id + saberhoaks.jabarprov.go.id + opendata.jabarprov + klinikhoaks.jatimprov.go.id (Mafindo 2018–2023 + sumber pemda). | 200; unduh gated |
| 4 | **BRIN Dataverse — Dataset Berita Palsu + fakta berbasis LLM** | https://data.brin.go.id/dataset.xhtml?persistentId=hdl:20.500.12690/RIN/7QBRKQ | **Train 6.241** obs (37,6 MB); **Test 506** obs (2,7 MB). Ada `test_set_hki_rev.tab` (revisi label mapping). | fake/real (hoaks vs valid); ada ringkasan fakta, tone, topik | **Custom Dataset Terms** (bukan MIT/CC terbuka bebas) | Publikasi **16 Okt 2024**. Klaim dari situs hoaks + judul portal berita yang diparafrase sebagai valid; dicek ulang Bing+LLM. | 200; **file restricted — harus Request Access** |
| 5 | **Indonesian Fact and Hoax Political News** (Kaggle) | https://www.kaggle.com/datasets/linkgish/indonesian-fact-and-hoax-political-news | Explorer: **~106 MB**. Paper yang sitir dataset ini (JAIC 2024): **20.928 fakta + 2.251 hoaks**. | fakta / hoaks (politik) | Deskripsi: **MIT**; Kaggle license field: “Other (specified in description)” | Scraped CNN, Kompas, Tempo, TurnBackHoax. Updated ~4 tahun lalu di card. | Halaman kebuka via WebFetch; HEAD dari box sempat 404 (blok bot) |
| 6 | **Deteksi Berita Hoaks Indo** (Kaggle) | https://www.kaggle.com/datasets/mochamadabdulazis/deteksi-berita-hoaks-indo-dataset | Per sumber di card: **TurnBackHoax 11.816**, Antara **4.066**, Kompas **4.499**, Detik **3.576** | Sumber memisahkan portal berita vs TBH (label harus digabung manual: TBH→HOAX, portal→FAKTA) | **Custom — Research and Education Only** (larangan komersial) | Scraping multi-sumber; cocok buat FAKTA dari Antara/Kompas/Detik | Halaman kebuka via WebFetch; HEAD box 404 |
| 7 | **Cek Fakta Kompas** (Kaggle) | https://www.kaggle.com/datasets/aginanjar/cek-fakta-kompas | Version 4 **~66 MB**; ada `cekfakta_kompas_with_text.csv` (10,18 MB) + file balanced hoax/valid | hoax / valid (ada file balanced) | **GPL-3** | Dari kompas.com/cekfakta | Halaman kebuka via WebFetch; HEAD box 404 |
| 8 | **jibranfawaid/turnbackhoax-dataset** | https://github.com/jibranfawaid/turnbackhoax-dataset | `Scrapping.csv`: **1.116** baris. Label: **`1`=433, `0`=683** (delimiter `;`) | Label, Headline, Body | **Tidak dinyatakan** di README | Diambil **25 Apr 2021** dari turnbackhoax.id | 200 |
| 9 | **INDONESIAN HOAX NEWS DETECTION DATASET** (Mendeley) | https://data.mendeley.com/datasets/p3hfgr5j3m/1 | File **250** dan **600** berita berlabel | `hoax` / `valid` (voting 3 referee) | **CC BY 4.0** (Link header Mendeley) | Publikasi dataset **15 Okt 2018**; paper ICTS 2017 | 200 |

### B. Korpus berita asli (bukan labeled hoaks — buat kelas FAKTA / kurangi style bias)

| # | Nama | URL | Ukuran | Label | Lisensi | Catatan | Status |
|---|------|-----|--------|-------|---------|---------|--------|
| 10 | **esteler-ai/idn-news-az** | https://huggingface.co/datasets/esteler-ai/idn-news-az | **1.149.789** baris; ~1,56 GB | Tidak ada label hoaks (title/text/date/link) | **CC BY 4.0** | Scraped Detik, Kompas, Tribun, Antara, Tempo, CNN, CNBC, dll. Card: berita **Jan–Okt 2023** (+ sedikit 2022) | 200 |
| 11 | **IndoSum** | https://github.com/kata-ai/indosum/ (+ mirror HF SEACrowd/indosum, joshuasiagian/indosum) | ~**19K** artikel (paper: ~20K sebelum filter; fold ~14.262 train) | Summarization (bukan hoaks). Sumber: CNN Indonesia, Kumparan, dll. | **Apache-2.0** | Bagus buat FAKTA tambahan bergaya redaksi | 200 |

### C. Yang sengaja **tidak** dimasukkan sebagai “dataset siap pakai”

- **Google Fact Check Tools API** — butuh API key; bukan corpus offline.
- Dataset yang cuma disebut di paper tapi URL-nya mati / gak kebuka saat riset ini.
- Scraping live Kompas/Tribun/Antara/Detik **baru** untuk training: boleh direncanakan, tapi **bukan** dataset siap-unduh hari ini; harus hormati ToS + rate limit. Untuk demo hackathon, lebih aman pakai korpus yang sudah ada (baris 6, 10, 11 + subset berita dari #1).

---

## 2) Rencana fine-tune konkret (belum dijalankan)

### 2.1 Tujuan

Kurangin **false positive** di berita resmi bergaya formal (kasus Tribun / Yonif), tanpa bikin model buta terhadap hoaks beneran.

### 2.2 Campuran data yang disarankan (v1)

**Prioritas unduh (gratis, tanpa kartu kredit):**

1. **Base:** `umn-cyber/mafindo-2024` all (sudah seimbang ~14k/15k) — MIT.
2. **Tambah FAKTA gaya redaksi:** sampling dari Kaggle Deteksi Berita Hoaks Indo (Antara+Kompas+Detik saja, label FAKTA=0) **atau** sampling 5k–15k dari `esteler-ai/idn-news-az` (filter host tribunnews.com, kompas.com, antaranews.com, detik.com).
3. **Tambah HOAX non-duplikat:** subset dari `nlp-brin-id/id-hoax-report-merge` / `fakenews-mafindo` (kalau auth HF berhasil) **atau** Kaggle Cek Fakta Kompas (hoax) + TBH GitHub 433 label-1.
4. **Opsional nanti:** BRIN Dataverse 6.241+506 — bagus tapi **Request Access** bisa molor; jangan diandalkan buat 15 Nov.

**Target mix kasar setelah dedup:** ~20k–35k train, class balance **mendekati 1:1** (kalau FAKTA kebanyakan → undersample FAKTA atau class weight; jangan oversample hoaks palsu).

### 2.3 Dedup & cleaning

- Normalisasi: lowercase ringan (sesuai tokenizer IndoBERT `do_lower_case=true`), hapus URL mentah, hapus prefix tag `[SALAH]` / `(SALAH)` dari title TBH biar model gak curang baca label di teks.
- Dedup: hash `title+content` + near-dup (MinHash / similarity ≥0,9) lintas sumber.
- Buang baris content < ~40 karakter.
- **Jangan** masukin teks “klaim + debunking panjang” campur sebagai HOAX tanpa pisah — kalau body-nya malah narasi klarifikasi, labelnya bikin bingung (mirip kasus style bias).

### 2.4 Split (time-based, bukan random)

- Kalau ada tanggal: **train = artikel lebih lama**, **held-out = 10–20% paling baru** (biar gak hafal isu lama).
- Kalau tanggal kosong (banyak di Mafindo scrape): split stratified 80/10/10 **setelah** dedup, pastiin judul yang sama gak ke train+test.
- Hard test set manual (wajib sebelum deploy):
  - 20–30 berita resmi Tribun/Kompas/Antara/Detik (harus FAKTA)
  - 20–30 klaim TBH/CekFakta terverifikasi HOAKS
  - Kasus video YouTube pendek (title+desc) kayak yang Day tes

### 2.5 Training recipe (lanjut dari checkpoint sekarang)

- Start dari bobot lokal `models/umn-cyber-indobert-hoax` (bukan dari scratch).
- Hyperparam ikut card asli sebagai baseline: lr **2e-5**, batch **16–32**, epochs **2–3**, max_len **256** (sama dengan `server.py`), AdamW, linear scheduler, seed 42.
- Class weight atau focal loss kalau residual imbalance.
- Early stop on **macro-F1** + monitor **FAKTA recall** (biar false positive turun).
- Metrics wajib: accuracy, precision/recall/F1 per kelas, confusion matrix, **FAKTA→HOAX false positive rate** di hard test.

### 2.6 Compute gratis (tanpa kartu)

| Opsi | Catatan | Estimasi kasar |
|------|---------|----------------|
| **Mac Apple Silicon (MPS)** yang sudah jalan `start-onprem.sh` | Paling cocok: data & model sudah di mesin Day | Fine-tune IndoBERT-base ~25k×3 epoch: kira-kira **1–4 jam** tergantung chip/RAM |
| **Google Colab free** (T4, sesi terbatas) | Harus upload dataset; sesi bisa putus | Mirip 1–3 jam / run; simpan checkpoint ke Drive |
| **Kaggle Notebooks free GPU** | Bagus kalau dataset sudah di Kaggle | 1–3 jam / run; kuota mingguan terbatas |

**Jangan** andalkan Hugging Face Inference Endpoints berbayar. Kartika memang sengaja `local_files_only=True`.

### 2.7 Estimasi jadwal realistis ke 15 Nov 2026

| Hari | Kerjaan |
|------|---------|
| H+0–1 | Unduh + dedup + build CSV train/val/test + hard test |
| H+1–2 | 1–2 run fine-tune (Mac MPS / Colab) |
| H+2–3 | Eval hard test; kalau FAKTA FP masih jelek → tambah FAKTA Tribun/Kompas sampling, 1 run lagi |
| H+3 | Swap bobot lokal + smoke test lewat `start-onprem.sh` + 5 URL live |
| Buffer | Bug Hunter 10–13 Nov: jangan ganti model di tengah tanpa backup |

**Kelayakan sebelum 15 Nov:**  
- **Ya, untuk v1 ringan** (lanjut fine-tune + tambah FAKTA dari korpus yang sudah ada + hard test) **kalau mulai segera** dan gak nunggu BRIN access.  
- **Tidak realistis** kalau targetnya “dataset akademik baru + paper-grade eval + multi-run ablation” sebelum submit.  
- **Mitigasi produk yang sudah ada** (vonis gak boleh HOAKS cuma dari skor IndoBERT sendirian kalau ada bukti media/cek fakta) **tetap harus hidup** meski model di-retrain — itu safety net.

---

## 3) Apa yang berubah di pipeline Kartika (dari inspeksi repo)

Repo: https://github.com/Moch-Iqbaal/kartika-sentinel

### 3.1 Loading model — `services/hoax/server.py`

- Baca bobot dari `HOAX_MODEL_DIR` (default `models/umn-cyber-indobert-hoax`) + tokenizer `HOAX_TOKENIZER_DIR` (`models/indobert-base-p1`).
- `local_files_only=True` — **gak** nge-hit HF saat request.
- `/classify` → softmax → `hoaxProbability` dari index label HOAX; threshold 0,5 di server untuk field `label`.
- **Setelah retrain:** cukup ganti file `model.safetensors` (+ `config.json` kalau id2label berubah). **Jaga FAKTA=0 / HOAX=1.** Endpoint FastAPI **tetap sama**.

### 3.2 Bootstrap Mac — `scripts/start-onprem.sh` + `scripts/fetch_indobert.py`

- `fetch_indobert.py` unduh `umn-cyber/indobert-hoax` publik ke folder models.
- `start-onprem.sh` jalanin server loopback + Cloudflare quick tunnel + POST `/api/model/register` + heartbeat 30 dtk.
- **Setelah retrain:** update `fetch_indobert.py` **atau** (lebih simpel) taruh bobot baru di `HOAX_MODEL_DIR` lokal Day dan **skip** overwrite unduhan. Jangan sentuh `.env.onprem` / `MODEL_REGISTER_SECRET`.

### 3.3 Skor & vonis — `src/lib/model/classify.ts` + `src/lib/analyze/*`

- `assessHoax`: IndoBERT lokal menang kalau `siap`; else linear; else heuristic. Skor utama **gak dicampur**.
- `ringkasan.ts` `decideVerdict` (urutan ketat):
  1. Ada cek fakta HOAKS → **Kemungkinan HOAKS**
  2. Ada cek fakta VALID **atau** media independen memberitakan sama → **Kemungkinan FAKTA**
  3. Opini/kritik kebijakan → **FAKTA**
  4. Baru pakai angka (≥0,5 → HOAKS)
- `evidence-stance.ts`: domain sendiri (mis. Tribun) **bukan** corroboration; list media kredibel sudah termasuk `tribunnews.com`.
- **Setelah retrain model:** TypeScript **hampir gak perlu berubah**. Yang berubah cuma distribusi `hoaxProbability`. Tetap pertahankan aturan evidence-first biar false positive model gak langsung jadi vonis HOAKS.

### 3.4 Yang perlu diubah di produk (kecil)

- Teks Ringkasan yang masih nyebut nama dataset/model teknis → bahasa biasa (udah sebagian dikerjakan).
- Hard-test otomatis (Tribun Yonif, dll.) masuk suite test biar regresi ketahuan.
- Opsional: simpan `modelVersion` string baru (mis. `indobert-hoax-kartika-2026-11`) biar di UI/log keliatan model mana yang aktif.

### 3.5 Yang **tidak** perlu diubah

- Skema Supabase `model_endpoint`, register secret, Vercel app URL, RLS.
- Format response `/classify` (`hoaxProbability`, `label`, `probabilities`).

---

## 4) Rekomendasi top 3 (buat mulai)

1. **`umn-cyber/mafindo-2024`** — base resmi model, MIT, balance oke, langsung unduh.  
2. **`esteler-ai/idn-news-az`** (sample Tribun/Kompas/Antara/Detik sebagai FAKTA) **atau** Kaggle **Deteksi Berita Hoaks Indo** bagian portal berita — obat style bias.  
3. **`nlp-brin-id/id-hoax-report-merge`** (kalau HF auth jalan) / **Cek Fakta Kompas** — HOAX tambahan di luar scrape Mafindo tunggal + label lebih kaya.

**Cadangan kecil:** Mendeley 600 (CC BY 4.0) + GitHub TBH 1.116 — jangan jadi tulang punggung, tapi oke buat eval.

---

## 5) Risiko & catatan jujur

- Banyak “dataset Indo hoaks” masih turunan **TurnBackHoax/Mafindo** → diversifikasi sumber FAKTA lebih penting daripada nambah HOAX sejenis.
- BRIN 2024 paling “bersih” secara desain (valid diparafrase + fakta LLM), tapi **gated** → risiko telat buat 15 Nov.
- Kaggle research-only / GPL: oke buat hackathon riset; kalau produk komersial belakangan, review lisensi lagi.
- Retrain **bukan** pengganti rule evidence-first di `ringkasan.ts`.

---

*File ini hasil riset executor. Belum ada perubahan kode, belum retrain, belum hapus data.*
