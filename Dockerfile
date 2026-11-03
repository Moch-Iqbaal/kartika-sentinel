# Image layanan IndoBERT untuk Cloud Run (CPU, tanpa GPU).
# Bobot publik diunduh saat build supaya image sudah berisi model.
# Bangun di Cloud Build bila jaringan lokal memblokir huggingface.co.

FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    HOAX_MODEL_DIR=/opt/models/umn-cyber-indobert-hoax \
    HOAX_TOKENIZER_DIR=/opt/models/indobert-base-p1 \
    PORT=8080 \
    HOAX_BIND_HOST=0.0.0.0

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY services/hoax/requirements.txt /tmp/requirements.txt
COPY scripts/fetch_indobert.py /tmp/fetch_indobert.py

RUN pip install --no-cache-dir "torch==2.15.0+cpu" --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r /tmp/requirements.txt \
    && python /tmp/fetch_indobert.py \
    && rm -rf /root/.cache /tmp/requirements.txt \
    && test -s "$HOAX_MODEL_DIR/model.safetensors" \
    && test -s "$HOAX_TOKENIZER_DIR/vocab.txt"

COPY services/hoax/server.py /app/server.py

RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /opt/models /app
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('PORT','8080'), timeout=4)"

CMD ["python", "/app/server.py"]
