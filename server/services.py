"""Service registry for Roz: manifest discovery.

Trust model
-----------
Commands are read **only** from ``<ROZ_SERVICES_DIR>/<service>/roz-service.json``
on this machine. The HTTP API never accepts a command string — just a service id,
a unit id and a known action id — so the worst a rogue client can do is run the
commands you already declared. Manifests are code: review them like code.

Probing and command execution live in ``server/services_runtime.py``.
"""

from __future__ import annotations

import json
import os
import re
import threading
from pathlib import Path
from typing import Any

MANIFEST_NAME = "roz-service.json"
# Categorías cerradas para el filtro del tablero (`kind` en el manifest).
KINDS = ("llm", "voice", "assistant", "api", "dashboard", "infra")
# Shell metacharacters that would let a manifest escape its declared command.
_UNSAFE_RE = re.compile(r"[;`]|\$\(|\n")

_lock = threading.Lock()


def _kind(raw: Any) -> str:
    value = str(raw or "").strip().lower().replace(" ", "-")
    return value if value in KINDS else "infra"


# ── discovery ──────────────────────────────────────────────────────────

def services_root() -> Path:
    return Path(os.environ.get("ROZ_SERVICES_DIR", "") or "~").expanduser()


def _bad_command(cmd: Any) -> bool:
    return not isinstance(cmd, str) or not cmd.strip() or bool(_UNSAFE_RE.search(cmd))


def _unit(raw: dict, svc_dir: Path) -> dict | None:
    if not isinstance(raw, dict) or not raw.get("name"):
        return None
    raw_ports = raw.get("ports") if isinstance(raw.get("ports"), list) else [raw.get("port")]
    ports = [int(p) for p in raw_ports if isinstance(p, (int, str)) and str(p).isdigit()]
    port = ports[0] if ports else None
    health = raw.get("health") or ""
    if health and not health.startswith("http") and port:
        health = f"http://127.0.0.1:{port}{health}"
    pid_file = raw.get("pid_file") or ""
    return {
        "id": str(raw.get("id") or raw["name"]).strip().lower().replace(" ", "-"),
        "name": str(raw["name"]),
        "port": port,
        "ports": ports,
        "health": health or None,
        "pid_file": str((svc_dir / pid_file)) if pid_file else None,
        "start": raw.get("start") if not _bad_command(raw.get("start")) else None,
        "stop": raw.get("stop") if not _bad_command(raw.get("stop")) else None,
        "expect": str(raw.get("expect") or "") or None,
    }


def _load_manifest(svc_dir: Path) -> dict | None:
    fp = svc_dir / MANIFEST_NAME
    if not fp.is_file():
        return None
    try:
        raw = json.loads(fp.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    if not isinstance(raw, dict):
        return None
    units = [u for u in (_unit(u, svc_dir) for u in raw.get("units") or []) if u]
    if not units:
        return None
    actions = [
        {
            "id": str(a.get("id") or a.get("label") or "").strip().lower().replace(" ", "-"),
            "label": str(a.get("label") or a.get("id") or "Run"),
            "command": a.get("command"),
            "danger": bool(a.get("danger", False)),
            "detached": bool(a.get("detached", raw.get("detached", False))),
        }
        for a in raw.get("actions") or []
        if isinstance(a, dict)
    ]
    docs = raw.get("docs") or ""
    return {
        "id": str(raw.get("id") or svc_dir.name).strip().lower(),
        "name": str(raw.get("name") or svc_dir.name),
        "dirname": svc_dir.name,
        "description": str(raw.get("description") or "").strip(),
        "url": str(raw.get("url") or "").strip() or None,
        "tags": [str(t) for t in raw.get("tags") or []],
        "kind": _kind(raw.get("kind")),
        "engine": str(raw.get("engine") or "").strip().lower(),
        "order": int(raw.get("order", 100)),
        "self": bool(raw.get("self", False)),
        "detached": bool(raw.get("detached", False)),
        "docs": str((svc_dir / docs)) if docs else None,
        "units": units,
        "actions": [a for a in actions if not _bad_command(a["command"])],
    }


def _synthesize(svc_dir: Path) -> dict | None:
    """Fallback: a bare directory with start.sh + stop.sh and no manifest."""
    if not (svc_dir / "start.sh").is_file() or not (svc_dir / "stop.sh").is_file():
        return None
    return {
        "id": svc_dir.name.lower(),
        "name": svc_dir.name,
        "dirname": svc_dir.name,
        "description": f"Undocumented service ({MANIFEST_NAME} not found). Port unknown.",
        "url": None,
        "tags": [],
        "kind": "infra",
        "engine": "",
        "order": 100,
        "self": False,
        "detached": False,
        "docs": None,
        "units": [
            {
                "id": "default",
                "name": "Process",
                "port": None,
                "ports": [],
                "health": None,
                "pid_file": None,
                "start": "./start.sh",
                "stop": "./stop.sh",
                "expect": None,
            }
        ],
        "actions": [],
    }


def registry() -> list[dict]:
    root = services_root()
    if not root.is_dir():
        return []
    found: list[dict] = []
    with _lock:
        for child in sorted(root.iterdir()):
            if not child.is_dir() or child.name.startswith("."):
                continue
            svc = _load_manifest(child) or _synthesize(child)
            if svc:
                svc["dir"] = str(child)
                found.append(svc)
    found.sort(key=lambda s: (s["order"], s["name"].lower()))
    return found


def get(service_id: str) -> dict | None:
    return next((s for s in registry() if s["id"] == service_id), None)


def read_docs(service_id: str) -> dict:
    svc = get(service_id)
    if svc is None:
        raise ValueError(f"Unknown service: {service_id}")
    root = Path(svc["dir"]).resolve()
    target = Path(svc["docs"]).resolve() if svc["docs"] else None
    if target is None or not target.is_file():
        raise ValueError(f"{svc['name']} declares no readable docs")
    if root not in target.parents:
        raise ValueError("Docs path escapes the service directory")
    return {"path": str(target), "content": target.read_text(encoding="utf-8", errors="replace")}
