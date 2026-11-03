"""Bangun korpus cek fakta lokal dari berkas yang sudah diunduh.

Utama: umn-cyber/mafindo-2024 (MIT), kolom title, content, is_hoax.
Tambahan kecil: 9uz/IDNHoaxCorpus (MIT) untuk tweet bertema militer.
Ditambah rekam kurasi publik di data/seed/curated.json.

nlp-brin-id tidak dipakai (gated / tidak lagi dipelihara).
Teks dipotong, nomor dan NIK disamarkan, sebutan @akun dihapus.
"""

from __future__ import annotations

import csv
import json
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "cache"
OUT = ROOT / "data" / "seed" / "fact-checks.json"

KEYS = (
    "tni", "kodam", "papua", "kkb", "opm", "gaza", "prajurit", "panglima",
    "kopassus", "kostrad", "alutsista", "tentara", "dwifungsi", "ruu tni",
    "uu tni", "abri", "mabes", "marinir", "pasukan",
)
PHONE = re.compile(r"(?:\+62|62|0)\s?8\d{2}(?:[\s.-]?\d){7,11}")
NIK = re.compile(r"(?<!\d)\d{16}(?!\d)")
STREET = re.compile(
    r"\b(?:jl\.?|jalan|gg\.?|gang)\s+[A-Za-z0-9][\w.'-]{1,24}(?:\s+[A-Za-z0-9][\w.'-]{1,24}){0,3}",
    re.I,
)
MENTION = re.compile(r"@[A-Za-z0-9_]{2,30}")


def clean(text: str, limit: int = 700) -> str:
    text = PHONE.sub("[nomor disamarkan]", text)
    text = NIK.sub("[nik disamarkan]", text)
    text = STREET.sub("[alamat disamarkan]", text)
    text = MENTION.sub("@redaksi", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def military(text: str) -> bool:
    lowered = text.lower()
    return any(key in lowered for key in KEYS)


def main() -> None:
    random.seed(2026)
    rows: list[dict] = []
    curated = json.loads((ROOT / "data" / "seed" / "curated.json").read_text(encoding="utf-8"))
    rows.extend(curated)

    mafindo_path = CACHE / "mafindo_cleaned.csv"
    military_rows: list[dict] = []
    other_rows: list[dict] = []
    mafindo_seen = 0
    if mafindo_path.exists():
        with mafindo_path.open(newline="", encoding="utf-8", errors="replace") as handle:
            for index, record in enumerate(csv.DictReader(handle)):
                mafindo_seen += 1
                title = clean(record.get("title") or "", 240)
                content = clean(record.get("content") or "", 700)
                if len(title) < 8:
                    continue
                label = str(record.get("is_hoax") or "1").strip()
                verdict = "hoax" if label in {"1", "hoax", "HOAX"} else "unverified"
                item = {
                    "id": f"mafindo-{index}",
                    "source": "umn-cyber/mafindo-2024",
                    "title": title,
                    "claim": content or title,
                    "verdict": verdict,
                    "url": None,
                    "publishedAt": None,
                    "summary": "Label korpus Mafindo/CekFakta pada umn-cyber/mafindo-2024 (MIT). Bukan putusan baru Kartika Sentinel. Tautan artikel asli tidak ada di berkas CSV.",
                    "license": "MIT",
                }
                blob = f"{title} {content}"
                if military(blob):
                    military_rows.append(item)
                elif verdict == "hoax":
                    other_rows.append(item)
    random.shuffle(other_rows)
    rows.extend(military_rows[:320])
    rows.extend(other_rows[:80])

    idn_path = CACHE / "idn-hoax.csv"
    idn_added = 0
    if idn_path.exists():
        with idn_path.open(newline="", encoding="utf-8", errors="replace") as handle:
            for index, record in enumerate(csv.DictReader(handle)):
                label = (record.get("label") or "").strip().lower()
                tweet = clean(record.get("tweet") or "", 500)
                if label not in {"hoax", "valid"} or len(tweet) < 20:
                    continue
                if not military(tweet):
                    continue
                rows.append(
                    {
                        "id": f"idn-{index}",
                        "source": "9uz/IDNHoaxCorpus",
                        "title": clean(record.get("keyword") or tweet, 180),
                        "claim": tweet,
                        "verdict": "hoax" if label == "hoax" else "true",
                        "url": None,
                        "publishedAt": None,
                        "summary": "Label korpus IDNHoaxCorpus (MIT, Universitas Muhammadiyah Ponorogo, 2020). URL akun tidak disimpan. Label valid/hoax pada tweet bukan artikel cek fakta lengkap.",
                        "license": "MIT",
                    }
                )
                idn_added += 1
                if idn_added >= 40:
                    break

    # SEACrowd/id_hoax_news berlisensi CC-BY-4.0. Cuplikan tidak diunduh paksa
    # agar benih tetap jalan bila Hugging Face tidak terjangkau.
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    info = {
        "factChecks": len(rows),
        "curated": len(curated),
        "mafindoRowsRead": mafindo_seen,
        "mafindoMilitaryKept": min(320, len(military_rows)),
        "mafindoMilitaryFound": len(military_rows),
        "mafindoOtherKept": min(80, len(other_rows)),
        "idnMilitaryKept": idn_added,
        "licenses": {
            "umn-cyber/mafindo-2024": "MIT",
            "umn-cyber/indobert-hoax": "MIT",
            "indobenchmark/indobert-base-p1": "MIT",
            "9uz/IDNHoaxCorpus": "MIT",
            "SEACrowd/id_hoax_news": "CC-BY-4.0",
        },
    }
    (ROOT / "data" / "seed" / "build-info.json").write_text(
        json.dumps(info, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(info))


if __name__ == "__main__":
    main()
