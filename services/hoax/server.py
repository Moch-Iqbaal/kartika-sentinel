"""Proses IndoBERT lokal untuk Kartika Sentinel.

Model: umn-cyber/indobert-hoax (MIT), label FAKTA=0 dan HOAX=1.
Tokenizer tidak ada di repo model itu. Tokenizer dimuat dari
indobenchmark/indobert-base-p1 yang sudah di-cache di disk.

Tidak ada token Hugging Face dan tidak ada Inference API.
local_files_only=True menolak unduhan saat permintaan masuk.
Jika berkas tidak ada, /health melaporkan ready=false dan Next.js
jatuh ke model linier lalu heuristik.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = Path(os.environ.get("HOAX_MODEL_DIR", ROOT / "models" / "umn-cyber-indobert-hoax"))
TOKENIZER_DIR = Path(os.environ.get("HOAX_TOKENIZER_DIR", ROOT / "models" / "indobert-base-p1"))
HOST = "127.0.0.1"
PORT = int(os.environ.get("HOAX_MODEL_PORT", "43124"))
MODEL_ID = "umn-cyber/indobert-hoax"

app = FastAPI(title="Kartika Sentinel IndoBERT", docs_url=None, redoc_url=None)
state: dict = {"ready": False, "error": None, "model": None, "tokenizer": None, "hoax_index": 1}


class ClassifyIn(BaseModel):
    # Field data. Bukan instruksi dan tidak ada tool-calling di proses ini.
    text: str = Field(min_length=1, max_length=4000)


def _authorized(header: str | None) -> None:
    expected = os.environ.get("LOCAL_MODEL_TOKEN", "").strip()
    if expected and header != expected:
        raise HTTPException(status_code=401, detail="Token model lokal salah.")


def _load() -> None:
    try:
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        if not (MODEL_DIR / "model.safetensors").exists():
            raise FileNotFoundError(f"Bobot tidak ada di {MODEL_DIR}")
        if not (TOKENIZER_DIR / "vocab.txt").exists():
            raise FileNotFoundError(f"Tokenizer tidak ada di {TOKENIZER_DIR}")

        tokenizer = AutoTokenizer.from_pretrained(
            str(TOKENIZER_DIR),
            local_files_only=True,
            do_lower_case=True,
        )
        model = AutoModelForSequenceClassification.from_pretrained(
            str(MODEL_DIR),
            local_files_only=True,
        )
        model.eval()
        label_map = {str(k): v for k, v in (model.config.id2label or {}).items()}
        hoax_index = 1
        for key, name in label_map.items():
            if str(name).upper() == "HOAX":
                hoax_index = int(key)
        state.update(
            ready=True,
            error=None,
            model=model,
            tokenizer=tokenizer,
            hoax_index=hoax_index,
            torch=torch,
        )
    except Exception as exc:  # noqa: BLE001 — layanan harus tetap hidup agar fallback jalan
        state.update(ready=False, error=str(exc)[:400])


@app.on_event("startup")
def startup() -> None:
    threading.Thread(target=_load, daemon=True).start()


@app.get("/health")
def health() -> dict:
    return {
        "ready": bool(state["ready"]),
        "model": MODEL_ID,
        "tokenizer": "indobenchmark/indobert-base-p1",
        "error": state["error"],
    }


@app.post("/classify")
def classify(body: ClassifyIn, x_kartika_model_token: str | None = Header(default=None)) -> dict:
    _authorized(x_kartika_model_token)
    if not state["ready"]:
        return {"available": False, "error": state["error"] or "Model masih dimuat."}

    torch = state["torch"]
    tokenizer = state["tokenizer"]
    model = state["model"]
    text = body.text.strip()
    batch = tokenizer(text, return_tensors="pt", truncation=True, max_length=256)
    with torch.no_grad():
        logits = model(**batch).logits[0]
        probabilities = torch.softmax(logits, dim=-1)
    hoax_index = int(state["hoax_index"])
    hoax_probability = float(probabilities[hoax_index])
    label = "HOAX" if hoax_probability >= 0.5 else "FAKTA"
    return {
        "available": True,
        "hoaxProbability": hoax_probability,
        "label": label,
        "model": MODEL_ID,
        "probabilities": [round(float(item), 6) for item in probabilities],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
