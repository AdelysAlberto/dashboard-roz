#!/usr/bin/env bash
# roz — start the markdown tracker dashboard
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "[roz] creating venv…"
  python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q fastapi "uvicorn[standard]" python-dotenv pyyaml
fi

if [ ! -d frontend/dist ] && command -v bun >/dev/null 2>&1; then
  echo "[roz] building frontend SPA…"
  (cd frontend && bun install && bun run build)
fi

# Read host/port without letting bash re-parse the whole .env (dotenv loads it in Python)
HOST=$(.venv/bin/python -c "from dotenv import dotenv_values; print(dotenv_values('.env').get('ROZ_HOST','127.0.0.1'))" 2>/dev/null || echo 127.0.0.1)
PORT=$(.venv/bin/python -c "from dotenv import dotenv_values; print(dotenv_values('.env').get('ROZ_PORT','8756'))" 2>/dev/null || echo 8756)

if [ -f .roz.pid ] && kill -0 "$(cat .roz.pid)" 2>/dev/null; then
  echo "[roz] already running (pid $(cat .roz.pid)) → http://$HOST:$PORT"
  exit 0
fi

echo "[roz] starting on http://$HOST:$PORT"
nohup .venv/bin/python -m uvicorn server.app:app --host "$HOST" --port "$PORT" > .roz.log 2>&1 &
echo $! > .roz.pid

sleep 1
if kill -0 "$(cat .roz.pid)" 2>/dev/null; then
  echo "[roz] up → http://$HOST:$PORT (log: .roz.log)"
else
  echo "[roz] failed to start, last log lines:"; tail -20 .roz.log; exit 1
fi
