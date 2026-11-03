#!/usr/bin/env python3
"""Unduh sumber HOAX/FAKTA ekstra non-Mafindo (Mendeley mirror + pierobeat)."""
from __future__ import annotations
import urllib.request
from pathlib import Path
import pandas as pd

def main() -> None:
    raw = Path("/tmp/kartika-raw/extra-hoax")
    raw.mkdir(parents=True, exist_ok=True)
    urls = {
        "mendeley600.csv": "https://raw.githubusercontent.com/yusrilf/hoax-detection-lstm/master/600%20news%20with%20valid%20hoax%20label.csv",
        "pierobeat.zip": "https://github.com/pierobeat/Hoax-News-Classification/archive/refs/heads/master.zip",
        "tbh_scrapping.csv": "https://raw.githubusercontent.com/jibranfawaid/turnbackhoax-dataset/master/Scrapping.csv",
    }
    for name, url in urls.items():
        dest = raw / name if name != "tbh_scrapping.csv" else Path("/tmp/kartika-raw") / name
        print("get", url)
        urllib.request.urlretrieve(url, dest)
    # normalize mendeley
    m = pd.read_csv(raw / "mendeley600.csv", sep=";", encoding="latin-1")
    rows = []
    for _, r in m.iterrows():
        lab = str(r["tagging"]).strip().lower()
        label = 1 if lab == "hoax" else 0
        text = str(r["berita"])
        if len(text) < 40:
            continue
        rows.append({"title": "", "content": text, "label": label, "source": "mendeley-600", "date": ""})
    pd.DataFrame(rows).to_csv(raw / "mendeley_norm.csv", index=False)
    # pierobeat
    import zipfile
    with zipfile.ZipFile(raw / "pierobeat.zip") as z:
        z.extractall(raw / "pierobeat")
    csvs = list((raw / "pierobeat").rglob("500_berita_indonesia.csv"))
    df = pd.read_csv(csvs[0], sep=";", encoding="utf-8-sig", engine="python", on_bad_lines="skip")
    rows = []
    for _, r in df.iterrows():
        lab = str(r["kategori"]).strip().lower()
        label = 1 if lab == "hoax" else 0 if lab == "valid" else None
        if label is None:
            continue
        text = str(r["berita"])
        if len(text) < 40:
            continue
        rows.append({"title": "", "content": text, "label": label, "source": "pierobeat-500", "date": ""})
    pd.DataFrame(rows).to_csv(raw / "pierobeat_norm.csv", index=False)
    print("wrote", raw / "mendeley_norm.csv", raw / "pierobeat_norm.csv")

if __name__ == "__main__":
    main()
