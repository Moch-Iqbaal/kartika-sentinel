"""Unduh bobot publik tanpa token.

Model: umn-cyber/indobert-hoax
Tokenizer: indobenchmark/indobert-base-p1 (tidak ada di repo model)

Jika jaringan Hugging Face diblokir, skrip gagal dan aplikasi tetap memakai
model linier serta heuristik. Tidak memakai Inference API.
"""

from __future__ import annotations

import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 10:
        print(f"skip {dest}")
        return
    print(f"get {url}")
    request = urllib.request.Request(url, headers={"user-agent": "kartika-sentinel-fetch"})
    with urllib.request.urlopen(request, timeout=120) as response, dest.open("wb") as handle:
        handle.write(response.read())
    print(f"ok {dest.name} {dest.stat().st_size}")


def main() -> None:
    model = ROOT / "models" / "umn-cyber-indobert-hoax"
    tokenizer = ROOT / "models" / "indobert-base-p1"
    model_base = "https://huggingface.co/umn-cyber/indobert-hoax/resolve/main/"
    tok_base = "https://huggingface.co/indobenchmark/indobert-base-p1/resolve/main/"
    for name in ("config.json", "model.safetensors"):
        download(model_base + name, model / name)
    for name in ("vocab.txt", "special_tokens_map.json"):
        download(tok_base + name, tokenizer / name)
    config = tokenizer / "tokenizer_config.json"
    config.write_text(
        '{\n  "do_lower_case": true,\n  "model_max_length": 512,\n  "tokenizer_class": "BertTokenizer"\n}\n',
        encoding="utf-8",
    )
    print("Selesai. Jalankan: python3 services/hoax/server.py")


if __name__ == "__main__":
    main()
