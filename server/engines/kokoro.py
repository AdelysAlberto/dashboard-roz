"""Kokoro TTS adapter: voces, síntesis de prueba y voz por defecto del servicio.

Kokoro no es un motor de inferencia con modelos descargables: su "inventario" son las
voces del modelo (embeddings fijos) y su estado es el health del servicio. La
superficie que Roz usa aquí es:
- `voices`: catálogo de voces + cuál es la por defecto ahora mismo.
- `synthesize`: prueba de voz (texto -> audio mp3 base64) para escuchar en el modal.
- `set_default`: fija la voz por defecto (Roz la persiste via POST /admin/default-voice).
- `metrics` / `logs` / `restart`: health, tail de /tmp/kokoro.log y `./ctl.sh restart`.

Sin autenticación (servicio local sin auth), a diferencia de oMLX.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from server import services
from server.engines.base import http_json, tail

_KOKORO_LOG = "/tmp/kokoro.log"


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
        raise ValueError(f"Kokoro no responde en {_port(service_id)}: {raw}")
    if status >= 400:
        detail = data.get("detail") if isinstance(data, dict) else raw[:200]
        raise ValueError(f"Kokoro {path}: HTTP {status} {detail}")
    return data


# ── voces ──────────────────────────────────────────────────────────────

def voices(service_id: str) -> dict:
    catalog = _call(service_id, "/voices")
    health = _call(service_id, "/health")
    default = catalog.get("default")
    items = catalog.get("voices") or []
    return {
        "voices": items,
        "total": catalog.get("count", len(items)),
        "default": default,
        "model_loaded": bool(health.get("model_loaded")),
    }


def synthesize(
    service_id: str,
    text: str,
    voice: str = "",
    speed: float = 1.0,
    fmt: str = "mp3",
) -> dict:
    """Prueba de voz: devuelve audio base64 para que el modal lo reproduzca."""
    text = (text or "").strip()
    if not text:
        raise ValueError("texto vacío")
    if len(text) > 2000:
        raise ValueError("texto demasiado largo (máx. 2000)")
    body = {"text": text, "speed": speed, "format": fmt}
    if voice:
        body["voice"] = voice
    data = _call(service_id, "/api/tts", "POST", body, timeout=120)
    return {
        "audio_base64": data.get("audioBase64"),
        "format": data.get("format", fmt),
        "duration_seconds": data.get("durationSeconds"),
        "voice": data.get("voice"),
    }


def set_default(service_id: str, voice: str) -> dict:
    voice = (voice or "").strip()
    if not voice:
        raise ValueError("voice requerida")
    data = _call(service_id, "/admin/default-voice", "POST", {"voice": voice})
    return {"ok": True, "default_voice": data.get("default_voice", voice)}


# ── estado, logs y control ─────────────────────────────────────────────

def metrics(service_id: str) -> dict:
    return {"health": _call(service_id, "/health")}


def logs(service_id: str, lines: int = 120) -> dict:
    return {"lines": tail(_KOKORO_LOG, lines)}


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
