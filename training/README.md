# Fine-tune IndoBERT untuk Kartika Sentinel

Skrip ini **tidak** dilatih otomatis dan **tidak** mengganti model produksi.
Tujuannya: campur data Mafindo + berita asli agar gaya berita resmi tidak kebaca hoaks.

## Target model

- Base: bobot lokal `models/umn-cyber-indobert-hoax` (lanjut fine-tune, bukan dari nol)
- Tokenizer: `models/indobert-base-p1`
- Label wajib: **FAKTA=0**, **HOAX=1** (sama dengan `services/hoax/server.py`)
- Keluaran: folder `training/output/` berisi `model.safetensors` + `config.json`

## Dataset (v1)

1. `umn-cyber/mafindo-2024` — base berlabel (MIT)
2. Sampling `esteler-ai/idn-news-az` (host tribunnews.com, kompas.com, antaranews.com, detik.com) sebagai **FAKTA**
3. Opsional: BRIN / Cek Fakta Kompas / TurnBackHoax GitHub — lihat `/workspace/kartika-dataset-plan.md` (atau salinan di `docs/`)

## Langkah

```bash
# Mac Apple Silicon (MPS) atau Colab
python3 -m venv .venv && source .venv/bin/activate
pip install -r training/requirements.txt

# 1) unduh + dedup + balance + time split
python3 training/prepare_data.py --out training/data

# 2) fine-tune (1–4 jam di Mac)
python3 training/finetune.py \
  --train training/data/train.csv \
  --val training/data/val.csv \
  --base models/umn-cyber-indobert-hoax \
  --tokenizer models/indobert-base-p1 \
  --out training/output

# 3) hard test (wajib lulus sebelum swap)
python3 training/eval_hard.py --model training/output --tokenizer models/indobert-base-p1
```

## Pasang di Mac (manual)

1. Cadangkan folder model lama.
2. Salin `training/output/model.safetensors` (+ `config.json`) ke `HOAX_MODEL_DIR`.
3. Jangan sentuh `.env.onprem` atau `MODEL_REGISTER_SECRET`.
4. Jalankan `./scripts/start-onprem.sh` dan uji 5 URL (termasuk Tribun Yonif).

## Hard test minimal

- 20+ berita resmi Tribun/Kompas/Antara/Detik → harus condong FAKTA
- 20+ klaim TBH/CekFakta → harus condong HOAKS
- Judul+deskripsi YouTube Tribun Yonif 143 → bukan false positive ekstrem
