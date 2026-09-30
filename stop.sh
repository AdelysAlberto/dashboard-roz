#!/usr/bin/env bash
# roz — stop the dashboard and any running pi analysis
set -euo pipefail
cd "$(dirname "$0")"

if [ -f .roz.pid ]; then
  PID=$(cat .roz.pid)
  if kill -0 "$PID" 2>/dev/null; then
    # kill child pi processes too
    pkill -P "$PID" 2>/dev/null || true
    kill "$PID" && echo "[roz] stopped (pid $PID)" || true
  else
    echo "[roz] pid $PID not running"
  fi
  rm -f .roz.pid
else
  echo "[roz] no pid file; nothing to stop"
fi
