#!/usr/bin/env bash
# Menjalankan IndoBERT di Mac Apple Silicon dan membuka HTTPS lewat Cloudflare quick tunnel.
# Tunnel ini tidak butuh akun atau kartu. URL berubah setiap kali skrip dijalankan.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "start-onprem.sh untuk macOS." >&2
  exit 1
fi
if [[ "$(uname -m)" != "arm64" ]]; then
  echo "start-onprem.sh untuk Apple Silicon (arm64), bukan $(uname -m)." >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 tidak ada. Pasang dari python.org atau Homebrew." >&2
  exit 1
fi
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared tidak ada. Pasang tanpa akun: brew install cloudflared" >&2
  exit 1
fi

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install -q -U pip
python -m pip install -q torch
python -m pip install -q -r services/hoax/requirements.txt
python scripts/fetch_indobert.py

ENV_FILE="$ROOT/.env.onprem"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${LOCAL_MODEL_TOKEN:-}" && -f .onprem-token ]]; then
  LOCAL_MODEL_TOKEN="$(tr -d '\n' < .onprem-token)"
fi
if [[ -z "${LOCAL_MODEL_TOKEN:-}" ]]; then
  LOCAL_MODEL_TOKEN="$(openssl rand -hex 32)"
fi
export LOCAL_MODEL_TOKEN
umask 077
touch "$ENV_FILE"
tmp_env="$(mktemp)"
if [[ -s "$ENV_FILE" ]]; then
  awk -v token="$LOCAL_MODEL_TOKEN" '
    BEGIN { done = 0 }
    /^LOCAL_MODEL_TOKEN=/ { print "LOCAL_MODEL_TOKEN=" token; done = 1; next }
    { print }
    END { if (!done) print "LOCAL_MODEL_TOKEN=" token }
  ' "$ENV_FILE" > "$tmp_env"
else
  printf 'LOCAL_MODEL_TOKEN=%s\n' "$LOCAL_MODEL_TOKEN" > "$tmp_env"
fi
mv "$tmp_env" "$ENV_FILE"
chmod 600 "$ENV_FILE"

PORT="${HOAX_MODEL_PORT:-43124}"
export HOAX_BIND_HOST=127.0.0.1
export HOAX_MODEL_PORT="$PORT"
unset PORT
unset K_SERVICE

LOG_DIR="${TMPDIR:-/tmp}"
SERVER_LOG="$LOG_DIR/kartika-hoax.log"
TUNNEL_LOG="$LOG_DIR/kartika-cloudflared.log"
: > "$SERVER_LOG"
: > "$TUNNEL_LOG"

python services/hoax/server.py >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
TUNNEL_PID=""
HEART_PID=""

cleanup() {
  if [[ -n "$HEART_PID" ]]; then
    kill "$HEART_PID" 2>/dev/null || true
  fi
  if [[ -n "$TUNNEL_PID" ]]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

ready=""
for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${HOAX_MODEL_PORT}/health" >/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Proses model berhenti. Isi log:" >&2
    cat "$SERVER_LOG" >&2
    exit 1
  fi
  sleep 1
done
if [[ -z "$ready" ]]; then
  echo "Model belum membuka port ${HOAX_MODEL_PORT}." >&2
  exit 1
fi

cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:${HOAX_MODEL_PORT}" >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

PUBLIC_URL=""
for _ in $(seq 1 40); do
  PUBLIC_URL="$(grep -Eo 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -n 1 || true)"
  if [[ -n "$PUBLIC_URL" ]]; then
    break
  fi
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "cloudflared berhenti. Isi log:" >&2
    cat "$TUNNEL_LOG" >&2
    exit 1
  fi
  sleep 1
done
if [[ -z "$PUBLIC_URL" ]]; then
  echo "URL tunnel tidak terbaca. Lihat $TUNNEL_LOG" >&2
  exit 1
fi

register_endpoint() {
  if [[ -z "${MODEL_REGISTER_SECRET:-}" || -z "${KARTIKA_APP_URL:-}" ]]; then
    return 2
  fi
  local base="${KARTIKA_APP_URL%/}"
  local payload
  payload="$(PUBLIC_URL="$PUBLIC_URL" LOCAL_MODEL_TOKEN="$LOCAL_MODEL_TOKEN" python3 -c 'import json,os; print(json.dumps({"url": os.environ["PUBLIC_URL"] + "/classify", "token": os.environ["LOCAL_MODEL_TOKEN"]}))')"
  curl -fsS -X POST "${base}/api/model/register" \
    -H "content-type: application/json" \
    -H "authorization: Bearer ${MODEL_REGISTER_SECRET}" \
    --data "$payload" >/dev/null
}

echo
echo "IndoBERT on-premise siap di Mac ini."
echo "Tunnel: ${PUBLIC_URL}"
if [[ -n "${MODEL_REGISTER_SECRET:-}" && -n "${KARTIKA_APP_URL:-}" ]]; then
  if register_endpoint; then
    echo "Endpoint terdaftar di web. Tidak perlu mengubah environment Vercel."
  else
    echo "Pendaftaran ke web gagal. Tunnel tetap jalan." >&2
  fi
  (
    while true; do
      sleep 30
      register_endpoint || true
    done
  ) &
  HEART_PID=$!
else
  echo "Isi MODEL_REGISTER_SECRET dan KARTIKA_APP_URL di .env.onprem agar tunnel terdaftar sendiri." >&2
fi
echo
echo "Biarkan jendela ini terbuka. Menutupnya memutus tunnel."
echo "Permintaan pertama dari web bisa menunggu bobot termuat."
echo

wait "$TUNNEL_PID"
