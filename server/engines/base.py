"""Shared plumbing for engine adapters (oMLX, Ollama, Splash).

Functional helpers only: HTTP with a persistent cookie jar (oMLX admin sessions),
a tiny in-memory task registry for long operations (descargas, pulls) and log tails.
"""

from __future__ import annotations

import http.cookiejar
import json
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

_jar = http.cookiejar.CookieJar()
_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_jar))

# ── task registry (descargas con progreso) ─────────────────────────────

_tasks: dict[str, dict[str, Any]] = {}
_task_lock = threading.Lock()
_TASK_KEEP = 40


def task_new(kind: str, label: str) -> str:
    tid = f"{kind}-{int(time.time() * 1000)}"
    with _task_lock:
        _tasks[tid] = {
            "id": tid,
            "kind": kind,
            "label": label,
            "state": "running",
            "progress": 0.0,
            "detail": "",
            "started_at": time.time(),
            "ended_at": None,
        }
        if len(_tasks) > _TASK_KEEP:
            for old in sorted(_tasks, key=lambda k: _tasks[k]["started_at"])[:-_TASK_KEEP]:
                _tasks.pop(old, None)
    return tid


def task_update(tid: str, **fields: Any) -> None:
    with _task_lock:
        task = _tasks.get(tid)
        if task is None:
            return
        task.update(fields)
        if fields.get("state") in ("done", "error") and task["ended_at"] is None:
            task["ended_at"] = time.time()


def task_list() -> list[dict[str, Any]]:
    with _task_lock:
        return sorted(_tasks.values(), key=lambda t: t["started_at"], reverse=True)


def task_get(tid: str) -> dict[str, Any] | None:
    with _task_lock:
        task = _tasks.get(tid)
        return dict(task) if task else None


# ── HTTP ───────────────────────────────────────────────────────────────

def http_json(
    url: str,
    method: str = "GET",
    body: Any = None,
    headers: dict[str, str] | None = None,
    timeout: float = 15,
) -> tuple[int, Any, str]:
    """Returns (status, parsed_json_or_None, raw_text). Never raises on HTTP errors."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("accept", "application/json")
    if data is not None:
        req.add_header("content-type", "application/json")
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with _opener.open(req, timeout=timeout) as res:
            raw = res.read(2_000_000).decode("utf-8", "replace")
            status = res.status
    except urllib.error.HTTPError as e:
        try:
            raw = e.read(200_000).decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            raw = ""
        return e.code, _parse(raw), raw
    except Exception as e:  # noqa: BLE001 - conexión caída, timeout, etc.
        return 0, None, str(e)
    return status, _parse(raw), raw


def _parse(raw: str) -> Any:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def tail(path: str | Path, lines: int = 120, limit: int = 200_000) -> str:
    fp = Path(path)
    if not fp.is_file():
        return ""
    try:
        size = fp.stat().st_size
        with fp.open("rb") as fh:
            if size > limit:
                fh.seek(size - limit)
            text = fh.read().decode("utf-8", "replace")
    except OSError:
        return ""
    return "\n".join(text.splitlines()[-max(1, lines):])


def auth_header(token: str) -> dict[str, str]:
    return {"authorization": f"Bearer {token}"} if token else {}
