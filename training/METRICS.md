# Metrik retrain v2 (CPU proof, 3 Nov 2026 WIB)

## Komposisi train (setelah balance + cap Mafindo HOAX ≤35%)

Lihat `training/data/composition.csv`. Ringkas HOAX: mafindo-2024-hoax 500 (~36%), tbh-github 431, pierobeat-500 225, mendeley-600 217. FAKTA: idn-news-az + news40k mendominasi (banyak outlet).

BRIN HF gated; Kaggle belum diunduh (butuh login). Colab notebook siap skala penuh + `--kaggle-dir`.

## Held-out (test.csv, max_len 128, 2 epoch CPU)

Akurasi ~1.00 / macro-F1 ~1.00 — **terlalu tinggi**, kemungkinan split masih “mudah”; jangan dianggap angka produksi. Pakai hard test di bawah.

## Hard test (110 contoh: 20 manual FAKTA + 10 manual HOAX + pool berita resmi)

| Model | Acc | FAKTA mean P(hoax) | FAKTA FP | Yonif 143 P(hoax) |
|-------|-----|--------------------|----------|-------------------|
| Lama `umn-cyber/indobert-hoax` | 0.491 | 0.563 | 0.56 | **0.911** |
| Baru v2 (mixed, CPU proof) | 0.855 | 0.157 | 0.16 | **0.0065** |

Catatan jujur: beberapa sampel FAKTA pendek soal TNI/Papua/BMKG masih false positive di model baru. Perlu run Colab penuh (max_len 256, 3 epoch, lebih banyak HOAX non-Mafindo dari Kaggle/BRIN).
