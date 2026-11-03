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

if [[ -z "${LOCAL_MODEL_TOKEN:-}" ]]; then
  if [[ -f .onprem-token ]]; then
    LOCAL_MODEL_TOKEN="$(cat .onprem-token)"
  else
    LOCAL_MODEL_TOKEN="$(openssl rand -hex 32)"
    umask 077
    printf '%s\n' "$LOCAL_MODEL_TOKEN" > .onprem-token
  fi
fi
export LOCAL_MODEL_TOKEN

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

cleanup() {
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

echo
echo "IndoBERT on-premise siap di Mac ini."
echo "Tempel dua baris ini ke environment Vercel, lalu redeploy:"
echo "LOCAL_HOAX_URL=${PUBLIC_URL}/classify"
echo "LOCAL_MODEL_TOKEN=${LOCAL_MODEL_TOKEN}"
echo
echo "Biarkan jendela ini terbuka. Menutupnya memutus tunnel."
echo "Permintaan pertama dari web bisa menunggu bobot termuat."
echo

wait "$TUNNEL_PID"
