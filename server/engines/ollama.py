"""Ollama engine adapter: inventario, cargados, pull con progreso y ciclo de vida.

Particularidad medida el 2026-10-12: el server lo respawnea la app. Un `pkill` de
`ollama serve` vuelve a levantar en segundos (verificado), así que **apagar = cerrar la app**
(`osascript -e 'quit app "Ollama"'`) y **encender = `launchctl kickstart gui/$UID/com.ollama.ollama`**
(verificado: API en 11434 en ~2s) o `open -a Ollama`.
"""

from __future__ import annotations

import json
import subprocess
import threading
import time
import urllib.request
from pathlib import Path
from typing import Any

from server import services
from server.engines.base import http_json, task_new, task_update

LABEL = "com.ollama.ollama"


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


def _run(argv: list[str], timeout: int = 60) -> dict:
    try:
        run = subprocess.run(argv, capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.SubprocessError) as e:
        raise ValueError(f"{' '.join(argv)}: {e}") from e
    return {
        "ok": run.returncode == 0,
        "exit_code": run.returncode,
        "output": ((run.stdout or "") + (run.stderr or "")).strip()[-600:],
    }


def version(service_id: str) -> dict:
    status, data, raw = http_json(f"{_base(service_id)}/api/version", timeout=5)
    return data if status == 200 else {"error": raw or f"HTTP {status}"}


def models(service_id: str) -> dict:
    status, data, raw = http_json(f"{_base(service_id)}/api/tags", timeout=8)
    if status == 0:
        raise ValueError(f"Ollama no responde en {_port(service_id)}: {raw}")
    if status >= 400:
        raise ValueError(f"Ollama /api/tags: HTTP {status}")
    items = (data or {}).get("models", [])
    normalized = [
        {
            "id": m.get("name"),
            "name": m.get("name"),
            "size": m.get("size"),
            "size_formatted": _fmt_bytes(m.get("size")),
            "parameter_size": (m.get("details") or {}).get("parameter_size"),
            "quantization": (m.get("details") or {}).get("quantization_level"),
            "family": (m.get("details") or {}).get("family"),
            "modified_at": m.get("modified_at"),
        }
        for m in items
    ]
    return {"models": normalized, "total": len(normalized)}


def running(service_id: str) -> dict:
    status, data, _ = http_json(f"{_base(service_id)}/api/ps", timeout=8)
    if status != 200:
        return {"loaded": []}
    return {
        "loaded": [
            {
                "id": m.get("name"),
                "size_vram": _fmt_bytes(m.get("size_vram")),
                "expires_at": m.get("expires_at"),
            }
            for m in (data or {}).get("models", [])
        ]
    }


def show(service_id: str, name: str) -> dict:
    status, data, raw = http_json(f"{_base(service_id)}/api/show", "POST", {"model": name})
    if status != 200:
        raise ValueError(f"Ollama /api/show: HTTP {status} {raw[:120]}")
    return {"model": name, "info": data}


def delete(service_id: str, name: str) -> dict:
    if not name:
        raise ValueError("modelo requerido")
    status, _, raw = http_json(f"{_base(service_id)}/api/delete", "DELETE", {"model": name})
    if status >= 400 or status == 0:
        raise ValueError(f"delete {name}: HTTP {status} {raw[:120]}")
    return {"ok": True, "deleted": name}


def _fmt_bytes(size: Any) -> str | None:
    if not isinstance(size, (int, float)) or size <= 0:
        return None
    gb = size / 1024**3
    return f"{gb:.2f} GB" if gb >= 1 else f"{size / 1024**2:.0f} MB"


def pull(service_id: str, name: str) -> dict:
    """Descarga en hilo aparte; el progreso se sigue con `task_get(id)` (base.task_list)."""
    if not name or not name.replace(":", "").replace("-", "").replace(".", "").replace("/", "").isalnum():
        raise ValueError(f"nombre de modelo inválido: {name!r}")
    tid = task_new("ollama-pull", name)
    base = _base(service_id)

    def _worker() -> None:
        req = urllib.request.Request(
            f"{base}/api/pull",
            data=json.dumps({"model": name, "stream": True}).encode(),
            method="POST",
        )
        req.add_header("content-type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=60 * 60) as res:  # noqa: S310 - loopback
                for line in res:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    total, done = event.get("total") or 0, event.get("completed") or 0
                    pct = (done / total * 100) if total else None
                    task_update(
                        tid,
                        progress=round(pct, 1) if pct is not None else 0.0,
                        detail=event.get("status") or "",
                    )
                    if event.get("error"):
                        task_update(tid, state="error", detail=str(event["error"])[:300])
                        return
            task_update(tid, state="done", progress=100.0, detail="descarga completa")
        except Exception as e:  # noqa: BLE001 - red/stream
            task_update(tid, state="error", detail=str(e)[:300])

    threading.Thread(target=_worker, daemon=True).start()
    return {"ok": True, "task_id": tid, "model": name}


def start(service_id: str) -> dict:
    return _run(["launchctl", "kickstart", _label()], timeout=45)


def stop(service_id: str) -> dict:
    return _run(["osascript", "-e", 'quit app "Ollama"'], timeout=45)


def restart(service_id: str) -> dict:
    """Cerrar la app y volver a arrancar su job: así el server relee la config del app."""
    quit_run = _run(["osascript", "-e", 'quit app "Ollama"'], timeout=45)
    time.sleep(2)
    start_run = start(service_id)
    return {
        "ok": start_run.get("ok", False),
        "exit_code": start_run.get("exit_code"),
        "output": f"{quit_run.get('output', '')}\n{start_run.get('output', '')}".strip()[-600:],
    }


def _label() -> str:
    uid = subprocess.run(["id", "-u"], capture_output=True, text=True, check=False).stdout.strip()
    return f"gui/{uid}/{LABEL}"


def settings(service_id: str) -> dict:
    """Config del server app-managed, en modo LECTURA.

    Ollama.app guarda todo en su SQLite privado (~/Library/Application Support/Ollama/db.sqlite,
    tabla `settings`) y de ahí saca el env con el que lanza `ollama serve`. Se lee en modo
    solo-lectura para mostrar la verdad; cambiarlo se hace desde la app (o desde Roz si el
    operador decide que Roz gestione el server — ver services/PORTS.md §8).
    """
    db = Path.home() / "Library/Application Support/Ollama/db.sqlite"
    app: dict[str, Any] = {}
    if db.is_file():
        try:
            run = subprocess.run(
                [
                    "sqlite3", "-json", f"file:{db}?mode=ro",
                    "select models, expose, context_length, selected_model from settings where id = 1;",
                ],
                capture_output=True, text=True, timeout=10, check=False,
            )
            rows = json.loads(run.stdout or "[]")
            if isinstance(rows, list) and rows and isinstance(rows[0], dict):
                app = {str(k): v for k, v in rows[0].items()}
            else:
                app = {"error": (run.stderr or "sin fila de settings").strip()[:200]}
        except (OSError, subprocess.SubprocessError, json.JSONDecodeError) as e:
            app = {"error": f"no se pudo leer la config de la app: {e}"}
    else:
        app = {"error": f"sin base de datos de la app en {db}"}
    return {
        "groups": {
            "app (solo lectura)": app,
            "server (heredado del app)": {
                "OLLAMA_MODELS": _server_env("OLLAMA_MODELS"),
                "OLLAMA_HOST": _server_env("OLLAMA_HOST"),
            },
        }
    }


def _server_env(name: str) -> str:
    """Variable de entorno del proceso `ollama serve` en ejecución (si está)."""
    try:
        pids = subprocess.run(
            ["pgrep", "-f", "ollama serve"], capture_output=True, text=True, timeout=5
        ).stdout.split()
        if not pids:
            return ""
        env = subprocess.run(
            ["ps", "eww", "-p", pids[0]], capture_output=True, text=True, timeout=5
        ).stdout
        for token in env.split():
            if token.startswith(f"{name}="):
                return token.split("=", 1)[1]
    except (OSError, subprocess.SubprocessError):
        return ""
    return ""


def metrics(service_id: str) -> dict:
    """Versión, inventario y qué está en memoria (Ollama no expone más por API)."""
    out: dict[str, Any] = {"version": version(service_id)}
    try:
        inv = models(service_id)
        out["inventory"] = {"total": inv["total"], "models": [m["id"] for m in inv["models"]]}
    except ValueError as e:
        out["inventory"] = {"error": str(e)}
    out["loaded"] = running(service_id).get("loaded", [])
    return out
