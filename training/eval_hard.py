#!/usr/bin/env python3
"""Hard test kasar: berita resmi vs klaim hoaks singkat."""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

FAKTA_SAMPLES = [
    "450 Prajurit TNI AD Yonif 143 Kembali ke Lampung Usai Bertugas di Perbatasan RI-PNG. Kapenrem 043 Gatam menyambut di Pelabuhan Panjang menuju Kodam XXI Radin Inten.",
    "Presiden membuka rapat kabinet di Istana Negara pada Senin pagi dan membahas anggaran infrastruktur.",
    "BMKG mengeluarkan peringatan dini cuaca ekstrem untuk wilayah Jawa Barat hingga Rabu malam.",
]

HOAX_SAMPLES = [
    "Sebarkan! 20.000 prajurit TNI sudah diterbangkan ke Gaza sebagai pasukan perdamaian.",
    "BREAKING: Presiden diganti diam-diam malam ini, segera viralkan sebelum dihapus.",
    "Video: vaksin mengandung chip pelacak yang dikendalikan satelit asing.",
]


def score(model, tokenizer, text: str) -> float:
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=256)
    with torch.no_grad():
        logits = model(**inputs).logits[0]
        probs = torch.softmax(logits, dim=-1)
    # HOAX index = 1
    return float(probs[1].item())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--tokenizer", type=Path, required=True)
    args = parser.parse_args()
    tokenizer = AutoTokenizer.from_pretrained(str(args.tokenizer), local_files_only=True, do_lower_case=True)
    model = AutoModelForSequenceClassification.from_pretrained(str(args.model), local_files_only=True)
    model.eval()

    print("FAKTA samples (hoaxProbability harus rendah):")
    for text in FAKTA_SAMPLES:
        print(f"  {score(model, tokenizer, text):.3f}  {text[:70]}")
    print("HOAX samples (hoaxProbability harus tinggi):")
    for text in HOAX_SAMPLES:
        print(f"  {score(model, tokenizer, text):.3f}  {text[:70]}")


if __name__ == "__main__":
    main()
