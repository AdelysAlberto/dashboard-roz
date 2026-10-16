"""oMLX engine adapter: modelos, carga/descarga, descargas HF, settings y métricas.

Dos superficies distintas, y esto importa:
- `v1` con `Authorization: Bearer <api_key>` → inventario, cargar/descargar de memoria, inferencia.
- `admin` → descargas de HuggingFace, settings globales y por modelo, logs, métricas. Exige
  sesión: `POST /admin/api/login {"api_key": ..., "remember": true}` (el mismo api_key, cookie).
  El header Bearer NO sirve para admin (devuelve 401), por eso hay login + cookie.
- Reiniciar: `omlx restart` (servicio launchd `sh.brew.omlx`), **no** `POST /admin/api/server/restart`
  — verificado el 2026-10-12: ese endpoint apaga el server y el supervisor del menubar no lo levanta.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Any

from server import services
from server.engines.base import auth_header, http_json

_SECRET_HINTS = ("api_key", "hf_token", "token", "secret", "password")
_session: dict[str, Any] = {"port": None, "ok": False}
# Claves aceptadas en un patch (las del GlobalSettingsRequest que tiene sentido tocar desde Roz).
_SETTINGS_KEYS = {
    "host", "port", "log_level", "auto_start_on_launch", "max_concurrent_requests",
    "temperature", "top_p", "top_k", "max_tokens", "repetition_penalty",
    "max_context_window", "memory_guard_tier", "memory_guard_custom_ceiling_gb",
    "cache_enabled", "ssd_cache_dir", "ssd_cache_max_size", "hot_cache_only",
    "hot_cache_max_size", "idle_timeout_seconds", "model_dir", "model_dirs", "model_fallback",
    "hide_helper_models", "hf_cache_enabled", "hf_cache_path", "hf_endpoint", "api_key",
    "skip_api_key_verification", "embedding_batch_size", "chunked_prefill", "usage_history",
}


# ── resolución de contexto ─────────────────────────────────────────────

def config() -> dict[str, Any]:
    try:
        return json.loads((Path.home() / ".omlx/config.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def api_key() -> str:
    return str(config().get("api_key") or "")


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


def _login(service_id: str) -> None:
    status, _, _ = http_json(
        f"{_base(service_id)}/admin/api/login", "POST", {"api_key": api_key(), "remember": True}
    )
    _session.update({"port": _port(service_id), "ok": status in (200, 201)})
    if not _session["ok"]:
        raise ValueError("oMLX: login de admin rechazado (revisá el api_key)")


def _admin(service_id: str, path: str, method: str = "GET", body: Any = None) -> Any:
    if _session["port"] != _port(service_id):
        _login(service_id)
    status, data, raw = http_json(f"{_base(service_id)}{path}", method, body)
    if status in (401, 403):
        _login(service_id)
        status, data, raw = http_json(f"{_base(service_id)}{path}", method, body)
    if status == 0:
        raise ValueError(f"oMLX no responde en {_port(service_id)}: {raw}")
    if status >= 400:
        detail = data.get("detail") if isinstance(data, dict) else None
        raise ValueError(f"oMLX {path}: HTTP {status} {detail or raw[:160]}")
    return data


def _mask(value: Any, key: str = "") -> Any:
    if isinstance(value, dict):
        return {k: _mask(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [_mask(v, key) for v in value]
    if any(hint in key.lower() for hint in _SECRET_HINTS) and isinstance(value, str) and value:
        return "••••••"
    return value


# ── modelos ────────────────────────────────────────────────────────────

def _normalize(item: dict) -> dict:
    return {
        "id": item.get("id"),
        "name": item.get("display_name") or item.get("id"),
        "loaded": bool(item.get("loaded")),
        "loading": bool(item.get("is_loading")),
        "size": item.get("actual_size_formatted") or item.get("estimated_size_formatted"),
        "type": item.get("model_type") or item.get("engine_type"),
        "context": item.get("model_context_length"),
        "default": bool(item.get("is_default")),
        "favorite": bool(item.get("is_favorite")),
        "pinned": bool(item.get("pinned")),
        "helper": bool(item.get("is_helper")),
        "source": item.get("source_repo_id"),
        "last_access": item.get("last_access"),
    }


def models(service_id: str) -> dict:
    payload = _admin(service_id, "/admin/api/models")
    items = payload.get("models") if isinstance(payload, dict) else payload
    items = items if isinstance(items, list) else []
    normalized = [_normalize(i) for i in items]
    return {
        "models": normalized,
        "total": len(normalized),
        "loaded": [m for m in normalized if m["loaded"]],
        "model_dir": (payload or {}).get("model_dir") if isinstance(payload, dict) else None,
    }


def model_action(service_id: str, model_id: str, op: str) -> dict:
    if op not in ("load", "unload"):
        raise ValueError(f"op inválida: {op}")
    if not model_id:
        raise ValueError("model_id requerido")
    status, data, raw = http_json(
        f"{_base(service_id)}/v1/models/{model_id}/{op}",
        "POST",
        headers=auth_header(api_key()),
    )
    if status == 0:
        raise ValueError(f"oMLX no responde: {raw}")
    if status >= 400:
        detail = data.get("detail") if isinstance(data, dict) else raw[:160]
        raise ValueError(f"{op} {model_id}: HTTP {status} {detail}")
    return {"ok": True, "op": op, "model_id": model_id, "result": data}


def model_settings(service_id: str, model_id: str) -> dict:
    for item in models(service_id)["models"]:
        if item["id"] == model_id:
            return {"model_id": model_id, "settings": _mask(item)}
    raise ValueError(f"modelo desconocido: {model_id}")


def update_model_settings(service_id: str, model_id: str, patch: dict) -> dict:
    if not isinstance(patch, dict) or not patch:
        raise ValueError("patch vacío")
    data = _admin(service_id, f"/admin/api/models/{model_id}/settings", "PUT", patch)
    return {"ok": True, "model_id": model_id, "result": data}


# ── settings globales ──────────────────────────────────────────────────

def settings(service_id: str) -> dict:
    return {"groups": _mask(_admin(service_id, "/admin/api/global-settings"))}


def update_settings(service_id: str, patch: dict) -> dict:
    _validate_patch(patch)
    data = _admin(service_id, "/admin/api/global-settings", "POST", patch)
    _session.update({"port": None})  # el puerto puede haber cambiado: forzar re-login
    return {"ok": True, "result": _mask(data)}


# Claves del patch que son rutas de disco: se validan antes de mandarlas al motor.
_PATH_KEYS = {"model_dir", "model_dirs", "ssd_cache_dir", "hf_cache_path", "gdn_snapshot_storage",
              "paged_ssd_cache_dir", "cache_dir"}
_BAD_PATH_CHARS = re.compile(r"[;&|`$(<>\n]")


def _validate_patch(patch: dict) -> None:
    if len(patch) > 40:
        raise ValueError("patch demasiado grande")
    for key, value in patch.items():
        if not isinstance(key, str) or key not in _SETTINGS_KEYS:
            raise ValueError(f"clave de configuración desconocida: {key!r}")
        if key in _PATH_KEYS:
            for path in value if isinstance(value, list) else [value]:
                if not isinstance(path, str) or not path.startswith("/"):
                    raise ValueError(f"{key} debe ser una ruta absoluta")
                if _BAD_PATH_CHARS.search(path):
                    raise ValueError(f"{key} contiene caracteres no permitidos")
                if not Path(path).is_dir():
                    raise ValueError(f"{key}: el directorio no existe ({path})")


# ── descargas de HuggingFace ───────────────────────────────────────────

def hf_search(service_id: str, query: str, limit: int = 12) -> dict:
    path = f"/admin/api/hf/search?q={query}&limit={max(1, min(limit, 50))}"
    data = _admin(service_id, path)
    if isinstance(data, dict):
        items = data.get("models") or data.get("results") or []
        total = data.get("total")
        token_invalid = bool(data.get("hf_token_invalid"))
    else:
        items, total, token_invalid = (data or []), None, False
    return {
        "query": query,
        "total": total if total is not None else len(items),
        "hf_token_invalid": token_invalid,
        "results": items[:50],
    }


def hf_download(service_id: str, repo_id: str) -> dict:
    if not repo_id:
        raise ValueError("repo_id requerido")
    data = _admin(service_id, "/admin/api/hf/download", "POST", {"repo_id": repo_id})
    return {"ok": True, "repo_id": repo_id, "result": data}


def tasks(service_id: str) -> dict:
    try:
        data = _admin(service_id, "/admin/api/hf/tasks")
    except ValueError as e:
        return {"tasks": [], "error": str(e)}
    items = data.get("tasks") if isinstance(data, dict) else data
    return {"tasks": items or []}


# ── métricas, logs y control del server ────────────────────────────────

def metrics(service_id: str) -> dict:
    out: dict[str, Any] = {}
    for key, path in (
        ("server", "/admin/api/server-info"),
        ("device", "/admin/api/device-info"),
        ("stats", "/admin/api/stats"),
        ("usage", "/admin/api/usage"),
        ("activity", "/admin/api/activity"),
    ):
        try:
            out[key] = _mask(_admin(service_id, path))
        except ValueError as e:
            out[key] = {"error": str(e)}
    return out


def logs(service_id: str, lines: int = 120) -> dict:
    data = _admin(service_id, f"/admin/api/logs?lines={max(1, min(lines, 500))}")
    if isinstance(data, dict):
        text = data.get("logs") or data.get("lines") or data.get("log") or ""
        return {
            "lines": str(text),
            "log_file": data.get("log_file"),
            "total_lines": data.get("total_lines"),
        }
    return {"lines": str(data)}


def restart(service_id: str) -> dict:
    """`omlx restart` (launchd sh.brew.omlx). Ver docstring del módulo."""
    try:
        run = subprocess.run(
            ["omlx", "restart"], capture_output=True, text=True, timeout=180, check=False
        )
    except (OSError, subprocess.SubprocessError) as e:
        raise ValueError(f"no se pudo ejecutar omlx restart: {e}") from e
    out = (run.stdout or run.stderr or "").strip()
    return {"ok": run.returncode == 0, "exit_code": run.returncode, "output": out[-600:]}
