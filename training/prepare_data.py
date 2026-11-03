#!/usr/bin/env python3
"""Siapkan CSV train/val/test: Mafindo + sampling idn-news-az sebagai FAKTA."""

from __future__ import annotations

import argparse
import hashlib
import re
from pathlib import Path

import pandas as pd

FAKTA_HOSTS = ("tribunnews.com", "kompas.com", "antaranews.com", "detik.com", "tempo.co")


def norm(text: str) -> str:
    text = re.sub(r"https?://\S+", " ", str(text))
    text = re.sub(r"\[SALAH\]|\(SALAH\)", " ", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip().lower()


def row_hash(title: str, content: str) -> str:
    return hashlib.sha1(f"{norm(title)}|{norm(content)}".encode()).hexdigest()


def load_mafindo() -> pd.DataFrame:
    from datasets import load_dataset

    ds = load_dataset("umn-cyber/mafindo-2024", split="train")
    rows = []
    for item in ds:
        title = str(item.get("title") or "")
        content = str(item.get("content") or "")
        label = int(item.get("is_hoax") if "is_hoax" in item else item.get("label", 0))
        if len(content) < 40:
            continue
        rows.append({"title": title, "content": content, "label": 1 if label == 1 else 0, "source": "mafindo"})
    return pd.DataFrame(rows)


def sample_news(limit: int = 12000) -> pd.DataFrame:
    from datasets import load_dataset

    ds = load_dataset("esteler-ai/idn-news-az", split="train", streaming=True)
    rows = []
    for item in ds:
        link = str(item.get("link") or item.get("url") or "")
        if not any(host in link for host in FAKTA_HOSTS):
            continue
        title = str(item.get("title") or "")
        content = str(item.get("text") or item.get("content") or "")
        if len(content) < 40:
            continue
        rows.append({"title": title, "content": content, "label": 0, "source": "idn-news-az"})
        if len(rows) >= limit:
            break
    return pd.DataFrame(rows)


def balance(df: pd.DataFrame) -> pd.DataFrame:
    hoax = df[df.label == 1]
    fakta = df[df.label == 0]
    n = min(len(hoax), len(fakta))
    return pd.concat([hoax.sample(n=n, random_state=42), fakta.sample(n=n, random_state=42)]).sample(frac=1, random_state=42)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=Path("training/data"))
    parser.add_argument("--news-limit", type=int, default=12000)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    mafindo = load_mafindo()
    news = sample_news(args.news_limit)
    df = pd.concat([mafindo, news], ignore_index=True)
    df["key"] = [row_hash(t, c) for t, c in zip(df.title, df.content)]
    df = df.drop_duplicates("key")
    df = balance(df)

    # Split: 80/10/10 stratified (tanggal sering kosong di Mafindo)
    from sklearn.model_selection import train_test_split

    train, temp = train_test_split(df, test_size=0.2, random_state=42, stratify=df.label)
    val, test = train_test_split(temp, test_size=0.5, random_state=42, stratify=temp.label)
    for name, part in ("train", train), ("val", val), ("test", test):
        part[["title", "content", "label", "source"]].to_csv(args.out / f"{name}.csv", index=False)
        print(name, len(part), "hoax", int((part.label == 1).sum()), "fakta", int((part.label == 0).sum()))


if __name__ == "__main__":
    main()
