"""Service runtime for Roz: health probing for every declared unit."""

from __future__ import annotations

import json
import os
import socket
import subprocess
import threading
import urllib.error
import urllib.request
from pathlib import Path

from server import services

_probe_lock = threading.Lock()


# ── probing ────────────────────────────────────────────────────────────

def _listening(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.3):
            return True
    except OSError:
        return False


def _pid_on_port(port: int) -> int | None:
    try:
        out = subprocess.run(
            ["lsof", "-t", "-iTCP:" + str(port), "-sTCP:LISTEN"],
            capture_output=True, text=True, timeout=4,
        ).stdout.split()
        return int(out[0]) if out else None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def _alive(pid_file: str | None) -> int | None:
    if not pid_file:
        return None
    try:
        pid = int(Path(pid_file).read_text(encoding="utf-8").strip() or 0)
        os.kill(pid, 0)
        return pid
    except (OSError, ValueError):
        return None


def _detail(payload: dict | None) -> str | None:
    if not payload:
        return None
    bits = [
        str(payload[k])
        for k in ("status", "model", "default_voice", "version", "engine", "service")
        if payload.get(k)
    ]
    if payload.get("model_loaded") is True:
        bits.append("model loaded")
    elif payload.get("model_loaded") is False:
        bits.append("model loading")
    if isinstance(payload.get("roots"), list):
        bits.append(f"{len(payload['roots'])} roots")
    return " · ".join(bits) or None


def _health(url: str) -> tuple[bool, str, dict | None, int | None]:
    """Returns (reachable, body, payload, uptime_sec). Reads error bodies too:
    a 503 with ``model_loaded: false`` is a live server telling us it is busy."""
    body = ""
    try:
        with urllib.request.urlopen(url, timeout=2) as res:  # noqa: S310 - localhost only
            body = res.read(8192).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            body = e.read(8192).decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            return False, "", None, None
    except Exception:  # noqa: BLE001 - any other failure means "no health"
        return False, "", None, None
    try:
        payload = json.loads(body or "{}")
    except json.JSONDecodeError:
        payload = None
    payload = payload if isinstance(payload, dict) else None
    raw_uptime = (
        (payload or {}).get("uptimeSec")
        or (payload or {}).get("uptime_sec")
        or (payload or {}).get("uptime_seconds")
    )
    uptime = int(raw_uptime) if isinstance(raw_uptime, (int, float)) else None
    return True, body, payload, uptime


def _probe(unit: dict) -> dict:
    out = {k: unit[k] for k in ("id", "name", "port", "ports", "health")}
    out.update({"state": "unknown", "pid": None, "detail": None, "uptime_sec": None})
    ports = unit["ports"]
    listening = [p for p in ports if _listening(p)]
    if not ports:
        out["detail"] = "no port declared"
    elif listening:
        out["pid"] = _pid_on_port(listening[0])
        if len(listening) < len(ports):
            down = ", ".join(str(p) for p in ports if p not in listening)
            out.update({"state": "partial", "detail": f"port {down} not bound"})
        elif not unit["health"]:
            out["state"] = "up"
        else:
            reachable, body, payload, uptime = _health(unit["health"])
            if not reachable:
                out.update({"state": "up", "detail": "listening (health unreachable)"})
            elif unit["expect"] and unit["expect"] not in body:
                out.update({
                    "state": "unexpected",
                    "detail": f"port answers, but '{unit['expect']}' is missing from health",
                })
            else:
                out.update({"state": "up", "detail": _detail(payload), "uptime_sec": uptime})
    elif (pid := _alive(unit["pid_file"])) is not None:
        out.update({"state": "booting", "pid": pid, "detail": "process alive, port not bound"})
    else:
        out["state"] = "down"

    ops = []
    if unit["start"]:
        ops.append("start")
    if unit["stop"]:
        ops.append("stop")
    if unit["start"] and unit["stop"]:
        ops.append("restart")
    out["ops"] = ops
    return out


def _card_state(units: list[dict]) -> str:
    probed = [u for u in units if u["state"] != "unknown"]
    if not probed:
        return "unknown"
    if all(u["state"] == "up" for u in probed):
        return "on"
    if all(u["state"] == "down" for u in probed):
        return "off"
    return "partial"


def snapshot() -> list[dict]:
    with _probe_lock:
        result = []
        for svc in services.registry():
            units = [_probe(u) for u in svc["units"]]
            result.append({
                **{
                    k: svc[k]
                    for k in (
                        "id", "name", "dirname", "description", "url", "tags", "self", "dir",
                        "kind", "engine",
                    )
                },
                "docs": svc["docs"],
                "has_docs": bool(svc["docs"] and Path(svc["docs"]).is_file()),
                "units": units,
                "actions": [
                    {k: a[k] for k in ("id", "label", "danger", "detached")} for a in svc["actions"]
                ],
                "state": _card_state(units),
                "units_on": sum(1 for u in units if u["state"] == "up"),
                "units_total": len(units),
            })
        return result
