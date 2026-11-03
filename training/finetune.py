#!/usr/bin/env python3
"""Fine-tune IndoBERT; label FAKTA=0 HOAX=1 agar cocok dengan services/hoax/server.py."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import accuracy_score, classification_report, f1_score
from torch.utils.data import Dataset
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
)


class HoaxDataset(Dataset):
    def __init__(self, frame: pd.DataFrame, tokenizer, max_len: int = 256):
        self.frame = frame.reset_index(drop=True)
        self.tokenizer = tokenizer
        self.max_len = max_len

    def __len__(self) -> int:
        return len(self.frame)

    def __getitem__(self, index: int):
        row = self.frame.iloc[index]
        text = f"{row.title} {row.content}".strip()
        encoded = self.tokenizer(
            text,
            truncation=True,
            max_length=self.max_len,
            padding="max_length",
            return_tensors="pt",
        )
        item = {key: value.squeeze(0) for key, value in encoded.items()}
        item["labels"] = torch.tensor(int(row.label), dtype=torch.long)
        return item


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    return {
        "accuracy": float(accuracy_score(labels, preds)),
        "macro_f1": float(f1_score(labels, preds, average="macro")),
        "fakta_recall": float(
            ((preds == 0) & (labels == 0)).sum() / max(1, (labels == 0).sum())
        ),
        "hoax_recall": float(
            ((preds == 1) & (labels == 1)).sum() / max(1, (labels == 1).sum())
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", type=Path, required=True)
    parser.add_argument("--val", type=Path, required=True)
    parser.add_argument("--test", type=Path, default=None)
    parser.add_argument("--base", type=str, required=True, help="HF id or local path")
    parser.add_argument("--tokenizer", type=str, default=None)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--epochs", type=float, default=2)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--max-len", type=int, default=256)
    parser.add_argument("--local-files-only", action="store_true")
    args = parser.parse_args()

    tok_id = args.tokenizer or args.base
    tokenizer = AutoTokenizer.from_pretrained(
        str(tok_id), local_files_only=args.local_files_only, do_lower_case=True
    )
    model = AutoModelForSequenceClassification.from_pretrained(
        str(args.base),
        local_files_only=args.local_files_only,
        num_labels=2,
        id2label={0: "FAKTA", 1: "HOAX"},
        label2id={"FAKTA": 0, "HOAX": 1},
        ignore_mismatched_sizes=True,
    )

    train_ds = HoaxDataset(pd.read_csv(args.train), tokenizer, args.max_len)
    val_ds = HoaxDataset(pd.read_csv(args.val), tokenizer, args.max_len)
    device = (
        "mps"
        if torch.backends.mps.is_available()
        else ("cuda" if torch.cuda.is_available() else "cpu")
    )
    print("device", device, "train", len(train_ds), "val", len(val_ds))

    args.out.mkdir(parents=True, exist_ok=True)
    training = TrainingArguments(
        output_dir=str(args.out / "runs"),
        learning_rate=args.lr,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        num_train_epochs=args.epochs,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="macro_f1",
        greater_is_better=True,
        seed=42,
        report_to=[],
        fp16=torch.cuda.is_available(),
        dataloader_num_workers=0,
        logging_steps=50,
        save_total_limit=2,
    )
    trainer = Trainer(
        model=model,
        args=training,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],
    )
    trainer.train()
    trainer.save_model(str(args.out))
    tokenizer.save_pretrained(str(args.out))

    metrics = {"device": device}
    if args.test and args.test.exists():
        test_ds = HoaxDataset(pd.read_csv(args.test), tokenizer, args.max_len)
        pred = trainer.predict(test_ds)
        y = pred.label_ids
        p = np.argmax(pred.predictions, axis=-1)
        metrics["held_out"] = classification_report(
            y, p, target_names=["FAKTA", "HOAX"], output_dict=True
        )
        print(classification_report(y, p, target_names=["FAKTA", "HOAX"]))
    (args.out / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print("saved", args.out)


if __name__ == "__main__":
    main()
