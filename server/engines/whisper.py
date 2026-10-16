"""Whisper STT adapter: estado del modelo residente, carga/descarga y logs.

Whisper STT sirve un único modelo (STT_MODEL, large-v3-turbo sobre MLX) que puede
residir en RAM siempre (eager) o cargarse bajo demanda (lazy con idle TTL). La
superficie que Roz usa aquí es:
- `metrics`: /health del servicio (modelo, estado, RSS y memoria Metal en MB).
- `model_action`: load/unload contra /admin/load y /admin/unload.
- `logs`: tail de /tmp/stt.log.
- `restart`: ./ctl.sh restart (launchd, no matar el PID a mano).

Sin autenticación (servicio local sin auth), igual que Kokoro.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from server import services
from server.engines.base import http_json, tail

_STT_LOG = "/tmp/stt.log"


def _port(service_id: str) -> int:
    svc = services.get(service_id)
    if svc is None:
        raise ValueError(f"Unknown service: {service_id}")
    ports = [p for unit in svc["units"] for p in unit["ports"]]
    if not ports:
        raise ValueError(f"{svc['name']} no declara puerto")
    return int(ports[0])


def _base(service_id: str) -> str:
    return f"http://127.0.0.1:{_port(service_id)}"


def _call(service_id: str, path: str, method: str = "GET", body: Any = None,
          timeout: float = 30) -> Any:
    status, data, raw = http_json(f"{_base(service_id)}{path}", method, body, timeout=timeout)
    if status == 0:
        raise ValueError(f"Whisper STT no responde en {_port(service_id)}: {raw}")
    if status >= 400:
        detail = data.get("detail") if isinstance(data, dict) else raw[:200]
        raise ValueError(f"Whisper STT {path}: HTTP {status} {detail}")
    return data


# ── estado del modelo en memoria ───────────────────────────────────────

def metrics(service_id: str) -> dict:
    return {"health": _call(service_id, "/health")}


def model_action(service_id: str, model_id: str, op: str) -> dict:
    """Carga o descarga el modelo residente (/admin/load | /admin/unload)."""
    if op not in ("load", "unload"):
        raise ValueError(f"whisper no soporta '{op}'")
    health = _call(service_id, "/health")
    current = str(health.get("model") or "")
    if model_id and current and model_id != current:
        raise ValueError(f"whisper solo sirve {current} (recibido: {model_id})")
    # La carga del modelo puede tardar decenas de segundos en frío.
    data = _call(service_id, f"/admin/{op}", "POST", timeout=300)
    return {
        "ok": data.get("status") == "ok",
        "model": current,
        "model_loaded": bool(data.get("model_loaded")),
        "output": f"{op} → model_loaded={data.get('model_loaded')}",
    }


# ── logs y control ─────────────────────────────────────────────────────

def logs(service_id: str, lines: int = 120) -> dict:
    return {"lines": tail(_STT_LOG, lines)}


def restart(service_id: str) -> dict:
    svc = services.get(service_id)
    if svc is None:
        raise ValueError(f"Unknown service: {service_id}")
    root = Path(svc["dir"])
    try:
        run = subprocess.run(
            ["./ctl.sh", "restart"], cwd=root, capture_output=True, text=True,
            timeout=180, check=False,
        )
    except (OSError, subprocess.SubprocessError) as e:
        raise ValueError(f"no se pudo ejecutar ./ctl.sh restart: {e}") from e
    out = (run.stdout or run.stderr or "").strip()
    return {"ok": run.returncode == 0, "exit_code": run.returncode, "output": out[-600:]}
