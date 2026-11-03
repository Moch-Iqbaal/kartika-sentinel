# Fine-tune IndoBERT — Kartika Sentinel (data campuran)

Model lama (`umn-cyber/indobert-hoax`) dilatih didominasi Mafindo, jadi berita resmi TNI/Papua sering kebaca hoaks (contoh Tribun Yonif 143 ~99% hoaks). Skrip ini membangun **dataset campuran** lalu fine-tune ulang.

## Label wajib
- **FAKTA = 0**
- **HOAX = 1**
(sama dengan `services/hoax/server.py`)

## Sumber data
**HOAX (Mafindo di-cap ≤ ~35% baris HOAX):**
- subset HOAX `umn-cyber/mafindo-2024`
- TurnBackHoax GitHub (`jibranfawaid/turnbackhoax-dataset`, teks NARASI)
- SEACrowd / BRIN bila akses terbuka
- opsional: folder Kaggle yang sudah diunduh (`--kaggle-dir`)

**FAKTA (skala besar, banyak outlet):**
- `esteler-ai/idn-news-az` — **semua host**, boost topik TNI/Polri/Papua/pemerintah
- berita portal di repo mafindo (`news/politik-merge_40k.csv`) sebagai FAKTA
- subset FAKTA mafindo (di-cap agar tidak mendominasi)

## Cara paling mudah: Google Colab (GPU gratis)
1. Buka `training/retrain_colab.ipynb` di Colab.
2. Runtime → GPU → **Run all**.
3. Zip model masuk Google Drive `KartikaSentinel/kartika-indobert-hoax-v2.zip`.

## Cara lokal (Mac MPS / Linux)
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r training/requirements.txt

# 1) unduh + dedup + balance + hard test
python3 training/prepare_data.py --out training/data --raw /tmp/kartika-raw

# 2) fine-tune (1–4 jam di Mac MPS / Colab T4)
python3 training/finetune.py \
  --train training/data/train.csv \
  --val training/data/val.csv \
  --test training/data/test.csv \
  --base indobenchmark/indobert-base-p1 \
  --tokenizer indobenchmark/indobert-base-p1 \
  --out training/output \
  --epochs 3 --batch 16 --max-len 256

# 3) hard test vs model lama
python3 training/eval_hard.py \
  --model training/output \
  --tokenizer indobenchmark/indobert-base-p1 \
  --hard training/data/hard_test.csv \
  --baseline umn-cyber/indobert-hoax \
  --baseline-tokenizer indobenchmark/indobert-base-p1 \
  --out training/data/hard_eval.json
```

CPU-only (bukti kecil):
```bash
python3 training/prepare_data.py --out training/data --raw /tmp/kartika-raw --proof-max 2000 --skip-stream
python3 training/finetune.py ... --epochs 1 --batch 4 --max-len 128
```

## Pasang di Mac (ganti model produksi)
1. Cadangkan folder model lama (`models/umn-cyber-indobert-hoax`).
2. Salin `model.safetensors` + `config.json` (+ tokenizer bila ikut) dari hasil training ke `HOAX_MODEL_DIR`.
3. **Jangan** sentuh `.env.onprem` atau `MODEL_REGISTER_SECRET`.
4. Jalankan `./scripts/start-onprem.sh`, uji ulang link Tribun Yonif 143 — skor hoaks harus jauh turun, vonis mengarah FAKTA bila bukti media ada.

## Hard test minimal
- Banyak berita resmi TNI/pemerintah/Polri (termasuk teks Yonif 143) → harus condong **FAKTA**
- Klaim TBH/CekFakta → harus condong **HOAX**
