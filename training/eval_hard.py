#!/usr/bin/env python3
"""Hard test: berita resmi (Yonif 143 dll) vs klaim hoaks. Bandingkan model lama vs baru."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer


def score(model, tokenizer, text: str, device: str) -> float:
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=256)
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        logits = model(**inputs).logits[0]
        probs = torch.softmax(logits, dim=-1)
    return float(probs[1].item())


def load_model(model_path: str, tokenizer_path: str | None, local: bool):
    tok = AutoTokenizer.from_pretrained(
        tokenizer_path or model_path, local_files_only=local, do_lower_case=True
    )
    model = AutoModelForSequenceClassification.from_pretrained(
        model_path, local_files_only=local
    )
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device)
    model.eval()
    return model, tok, device


def eval_frame(model, tok, device, frame: pd.DataFrame) -> dict:
    rows = []
    for _, r in frame.iterrows():
        text = f"{r.title} {r.content}".strip()
        p = score(model, tok, text, device)
        pred = 1 if p >= 0.5 else 0
        exp = int(r.label)
        rows.append(
            {
                "tag": r.get("tag", ""),
                "expected": exp,
                "pred": pred,
                "hoax_prob": round(p, 4),
                "ok": pred == exp,
                "title": str(r.title)[:80],
            }
        )
    df = pd.DataFrame(rows)
    fakta = df[df.expected == 0]
    hoax = df[df.expected == 1]
    yonif = df[df.tag.astype(str).str.contains("yonif143", case=False, na=False)]
    return {
        "n": len(df),
        "accuracy": float(df.ok.mean()) if len(df) else 0.0,
        "fakta_accuracy": float(fakta.ok.mean()) if len(fakta) else None,
        "fakta_mean_hoax_prob": float(fakta.hoax_prob.mean()) if len(fakta) else None,
        "fakta_fp_rate": float((~fakta.ok).mean()) if len(fakta) else None,
        "hoax_accuracy": float(hoax.ok.mean()) if len(hoax) else None,
        "hoax_mean_hoax_prob": float(hoax.hoax_prob.mean()) if len(hoax) else None,
        "yonif143_hoax_prob": float(yonif.hoax_prob.iloc[0]) if len(yonif) else None,
        "rows": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=str, required=True)
    parser.add_argument("--tokenizer", type=str, default=None)
    parser.add_argument("--hard", type=Path, default=Path("training/data/hard_test.csv"))
    parser.add_argument("--baseline", type=str, default=None, help="old model to compare")
    parser.add_argument("--baseline-tokenizer", type=str, default=None)
    parser.add_argument("--local-files-only", action="store_true")
    parser.add_argument("--out", type=Path, default=Path("training/data/hard_eval.json"))
    args = parser.parse_args()

    hard = pd.read_csv(args.hard)
    report = {}
    model, tok, device = load_model(args.model, args.tokenizer, args.local_files_only)
    report["new"] = eval_frame(model, tok, device, hard)
    print("NEW accuracy", report["new"]["accuracy"], "yonif", report["new"]["yonif143_hoax_prob"])
    print("FAKTA mean hoax_prob", report["new"]["fakta_mean_hoax_prob"], "FP", report["new"]["fakta_fp_rate"])

    if args.baseline:
        bmodel, btok, bdev = load_model(
            args.baseline, args.baseline_tokenizer or args.tokenizer, args.local_files_only
        )
        report["old"] = eval_frame(bmodel, btok, bdev, hard)
        print("OLD accuracy", report["old"]["accuracy"], "yonif", report["old"]["yonif143_hoax_prob"])
        print("OLD FAKTA mean hoax_prob", report["old"]["fakta_mean_hoax_prob"], "FP", report["old"]["fakta_fp_rate"])

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("wrote", args.out)


if __name__ == "__main__":
    main()
