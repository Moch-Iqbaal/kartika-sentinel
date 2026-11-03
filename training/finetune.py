#!/usr/bin/env python3
"""Fine-tune IndoBERT; label FAKTA=0 HOAX=1 agar cocok dengan services/hoax/server.py."""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
import torch
from torch.utils.data import Dataset
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", type=Path, required=True)
    parser.add_argument("--val", type=Path, required=True)
    parser.add_argument("--base", type=Path, required=True)
    parser.add_argument("--tokenizer", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--epochs", type=float, default=2)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-5)
    args = parser.parse_args()

    tokenizer = AutoTokenizer.from_pretrained(str(args.tokenizer), local_files_only=True, do_lower_case=True)
    model = AutoModelForSequenceClassification.from_pretrained(
        str(args.base),
        local_files_only=True,
        num_labels=2,
        id2label={"0": "FAKTA", "1": "HOAX"},
        label2id={"FAKTA": 0, "HOAX": 1},
    )

    train_ds = HoaxDataset(pd.read_csv(args.train), tokenizer)
    val_ds = HoaxDataset(pd.read_csv(args.val), tokenizer)
    device = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
    print("device", device)

    args.out.mkdir(parents=True, exist_ok=True)
    training = TrainingArguments(
        output_dir=str(args.out / "runs"),
        learning_rate=args.lr,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        num_train_epochs=args.epochs,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        seed=42,
        report_to=[],
    )
    trainer = Trainer(model=model, args=training, train_dataset=train_ds, eval_dataset=val_ds)
    trainer.train()
    trainer.save_model(str(args.out))
    tokenizer.save_pretrained(str(args.out))
    print("saved", args.out)


if __name__ == "__main__":
    main()
