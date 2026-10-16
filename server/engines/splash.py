"""Splash engine adapter: lanzador de un modelo por proceso (no hay demonio ni inventario).

Splash (`incoai/tap/splash`) sirve un modelo en primer plano: `splash serve --model <repo[:variant]>`.
No expone inventario propio ni queda corriendo en background, así que este adapter compone el
comando, lo lanza desacoplado (nohup + pidfile + log) y lo controla por PID. El puerto se fija
explícito: su default vive dentro del paquete y no es legible ni estable.
"""

from __future__ import annotations

import os
import re
import signal
import subprocess
from pathlib import Path
from typing import Any

from server import services
from server.engines.base import http_json, tail

MODEL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/:@-]{1,180}$")
ARG_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:=/-]{0,80}$")
# Flags que aceptamos pasar desde la UI (evita inyección de opciones arbitrarias).
ALLOWED_FLAGS = {
    "--max-context", "--max-memory", "--kv-format", "--idle-release", "--cache-dir",
    "--max-cache-disk", "--draft-model", "--revision", "--served-model-name",
    "--request-timeout", "--queue-size", "--decode-share", "--language-only",
    "--persistent-cache", "--disable-ane", "--allow-idle-sleep", "--no-webui",
}


def _svc(service_id: str) -> dict:
    svc = services.get(service_id)
    if svc is None:
        raise ValueError(f"Unknown service: {service_id}")
    return svc


def _dir(service_id: str) -> Path:
    return Path(_svc(service_id)["dir"])


def _port(service_id: str) -> int:
    ports = [p for unit in _svc(service_id)["units"] for p in unit["ports"]]
    if not ports:
        raise ValueError(f"{_svc(service_id)['name']} no declara puerto")
    return int(ports[0])


def _pidfile(service_id: str) -> Path:
    return _dir(service_id) / ".splash.pid"


def _logfile(service_id: str) -> Path:
    return _dir(service_id) / "logs" / "splash.log"


def status(service_id: str) -> dict:
    pid = _pid(service_id)
    status_code, data, raw = http_json(f"http://127.0.0.1:{_port(service_id)}/v1/models", timeout=5)
    served: list[dict[str, Any]] = []
    if status_code == 200 and isinstance(data, dict):
        served = [
            {"id": m.get("id"), "owned_by": m.get("owned_by")}
            for m in (data.get("data") or [])
        ]
    return {
        "pid": pid,
        "serving": status_code == 200,
        "port": _port(service_id),
        "models": served,
        "detail": None if status_code == 200 else (raw[:160] or f"HTTP {status_code}"),
    }


def _pid(service_id: str) -> int | None:
    try:
        pid = int(_pidfile(service_id).read_text(encoding="utf-8").strip() or 0)
    except (OSError, ValueError):
        return None
    try:
        os.kill(pid, 0)
    except OSError:
        return None
    return pid


def launch(service_id: str, model: str, args: list[str] | None = None) -> dict:
    if not model or not MODEL_RE.match(model):
        raise ValueError(f"modelo inválido: {model!r} (esperado owner/repo[:variante])")
    extra = _validate_args(args or [])
    if _pid(service_id):
        raise ValueError("Splash ya está corriendo: parálo antes de lanzar otro modelo")

    log = _logfile(service_id)
    log.parent.mkdir(parents=True, exist_ok=True)
    argv = [
        "splash", "serve",
        "--model", model,
        "--port", str(_port(service_id)),
        *extra,
    ]
    with log.open("a", encoding="utf-8") as out:
        out.write(f"\n=== {argv} ===\n")
        out.flush()
        proc = subprocess.Popen(  # noqa: S603 - argv validado, sin shell
            argv,
            cwd=str(_dir(service_id)),
            stdout=out,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    _pidfile(service_id).write_text(str(proc.pid), encoding="utf-8")
    return {"ok": True, "pid": proc.pid, "argv": argv, "log": str(log)}


def _validate_args(args: list[str]) -> list[str]:
    clean: list[str] = []
    for token in args:
        if token.startswith("-"):
            if token.split("=")[0] not in ALLOWED_FLAGS:
                raise ValueError(f"flag no permitido: {token}")
            clean.append(token)
        else:
            if not ARG_RE.match(token):
                raise ValueError(f"valor de flag inválido: {token!r}")
            clean.append(token)
    return clean


def stop(service_id: str) -> dict:
    pid = _pid(service_id)
    if not pid:
        _pidfile(service_id).unlink(missing_ok=True)
        return {"ok": True, "stopped": False, "output": "Splash no estaba corriendo"}
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError as e:
        raise ValueError(f"no se pudo terminar el pid {pid}: {e}") from e
    _pidfile(service_id).unlink(missing_ok=True)
    return {"ok": True, "stopped": True, "pid": pid, "output": f"SIGTERM a {pid}"}


def logs(service_id: str, lines: int = 120) -> dict:
    return {"lines": tail(_logfile(service_id), lines)}
