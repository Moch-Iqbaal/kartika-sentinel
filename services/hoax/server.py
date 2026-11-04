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

import ipaddress
import os
import socket
import threading
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = Path(os.environ.get("HOAX_MODEL_DIR", ROOT / "models" / "umn-cyber-indobert-hoax"))
TOKENIZER_DIR = Path(os.environ.get("HOAX_TOKENIZER_DIR", ROOT / "models" / "indobert-base-p1"))
# Cloud Run mengisi PORT dan K_SERVICE. Di laptop, tetap loopback.
BIND = os.environ.get("HOAX_BIND_HOST") or ("0.0.0.0" if os.environ.get("K_SERVICE") or os.environ.get("PORT") else "127.0.0.1")
PORT = int(os.environ.get("PORT") or os.environ.get("HOAX_MODEL_PORT") or "43124")
MODEL_ID = "umn-cyber/indobert-hoax"
_load_lock = threading.Lock()

app = FastAPI(title="Kartika Sentinel IndoBERT", docs_url=None, redoc_url=None)
state: dict = {"ready": False, "error": None, "model": None, "tokenizer": None, "hoax_index": 1}


class ClassifyIn(BaseModel):
    # Field data. Bukan instruksi dan tidak ada tool-calling di proses ini.
    text: str = Field(min_length=1, max_length=4000)


class FetchIn(BaseModel):
    # URL berita publik untuk dibaca Mac bila Vercel ditolak situs asal.
    url: str = Field(min_length=8, max_length=2000)


FETCH_MAX_BYTES = 4_000_000
FETCH_TIMEOUT_SEC = 8.0
_FETCH_BLOCKED_HOSTS = {
    "localhost",
    "localhost.localdomain",
    "metadata.google.internal",
    "metadata.google.internal.",
}
_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)


def _authorized(header: str | None) -> None:
    expected = os.environ.get("LOCAL_MODEL_TOKEN", "").strip()
    if expected and header != expected:
        raise HTTPException(status_code=401, detail="Token model lokal salah.")


def _public_bind() -> bool:
    return BIND not in {"127.0.0.1", "localhost", "::1"}


def ensure_loaded() -> None:
    # Muat di dalam permintaan supaya Cloud Run (CPU hanya saat request) sempat menghitung.
    if state["ready"]:
        return
    with _load_lock:
        if not state["ready"]:
            _load()


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
    if _public_bind() and not os.environ.get("LOCAL_MODEL_TOKEN", "").strip():
        raise RuntimeError("LOCAL_MODEL_TOKEN wajib bila layanan dibuka di luar loopback.")
    # Pemanasan di thread hanya membantu proses yang CPUnya tidak dibekukan.
    # Permintaan /classify tetap memanggil ensure_loaded() sendiri.
    threading.Thread(target=ensure_loaded, daemon=True).start()


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
    ensure_loaded()
    if not state["ready"]:
        return {
            "available": False,
            "warming": True,
            "error": state["error"] or "Model masih dimuat.",
        }

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


def _blocked_ip(raw: str) -> bool:
    value = raw.strip().lower().strip("[]")
    if "%" in value:
        value = value.split("%", 1)[0]
    if value.startswith("::ffff:"):
        value = value[len("::ffff:") :]
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return True
    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _assert_public_http_url(raw: str) -> str:
    try:
        parsed = urlparse(raw)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="URL tidak valid.") from exc
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Hanya http dan https yang diizinkan.")
    if parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="URL dengan kredensial ditolak.")
    host = (parsed.hostname or "").rstrip(".").lower()
    if not host:
        raise HTTPException(status_code=400, detail="URL tidak valid.")
    if host in _FETCH_BLOCKED_HOSTS or host.endswith(".localhost") or host.endswith(".local"):
        raise HTTPException(status_code=400, detail="Host lokal ditolak.")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    if port not in {80, 443}:
        raise HTTPException(status_code=400, detail="Hanya port 80 dan 443 yang diizinkan.")
    try:
        ipaddress.ip_address(host)
        if _blocked_ip(host):
            raise HTTPException(status_code=400, detail="Alamat IP privat atau metadata ditolak.")
    except ValueError:
        try:
            infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        except OSError as exc:
            raise HTTPException(status_code=400, detail="Nama host tidak dapat diselesaikan.") from exc
        if not infos:
            raise HTTPException(status_code=400, detail="Nama host tidak dapat diselesaikan.")
        for info in infos:
            addr = info[4][0]
            if _blocked_ip(str(addr)):
                raise HTTPException(status_code=400, detail="Host mengarah ke alamat yang diblokir.")
    return raw


def _read_limited(response, limit: int = FETCH_MAX_BYTES) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while total < limit:
        piece = response.read(min(65_536, limit - total))
        if not piece:
            break
        chunks.append(piece)
        total += len(piece)
    return b"".join(chunks)


@app.post("/fetch")
def fetch_public(body: FetchIn, x_kartika_model_token: str | None = Header(default=None)) -> dict:
    """GET http(s) publik saja. Cadangan bila Vercel ditolak situs berita."""
    _authorized(x_kartika_model_token)
    target = _assert_public_http_url(body.url.strip())
    request = Request(
        target,
        method="GET",
        headers={
            "User-Agent": _BROWSER_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
            "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        },
    )
    try:
        with urlopen(request, timeout=FETCH_TIMEOUT_SEC) as response:  # noqa: S310 — URL sudah dicek publik
            content_type = (response.headers.get("Content-Type") or "text/html").split(";")[0].strip().lower()
            allowed = {
                "text/html",
                "text/plain",
                "application/json",
                "application/xhtml+xml",
                "application/xml",
                "text/xml",
                "application/rss+xml",
                "application/atom+xml",
            }
            if content_type not in allowed:
                raise HTTPException(status_code=400, detail="Tipe konten tidak diizinkan.")
            raw = _read_limited(response)
            final_url = response.geturl() or target
    except HTTPException:
        raise
    except HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Sumber menjawab HTTP {exc.code}.") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise HTTPException(status_code=502, detail="Sumber tidak dapat dibuka.") from exc
    try:
        _assert_public_http_url(final_url)
    except HTTPException:
        raise HTTPException(status_code=400, detail="Redirect mengarah ke alamat yang ditolak.") from None
    body_text = raw.decode("utf-8", errors="replace")
    if not body_text.strip():
        raise HTTPException(status_code=502, detail="Badan respons kosong.")
    return {
        "ok": True,
        "finalUrl": final_url,
        "contentType": content_type,
        "body": body_text,
    }



if __name__ == "__main__":
    import uvicorn

    if _public_bind() and not os.environ.get("LOCAL_MODEL_TOKEN", "").strip():
        raise SystemExit("LOCAL_MODEL_TOKEN wajib bila layanan dibuka di luar loopback.")
    uvicorn.run(app, host=BIND, port=PORT, log_level="info")
