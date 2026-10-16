"""Command execution for the service registry. Commands are resolved server-side
from on-disk manifests and never accepted from the client."""

from __future__ import annotations

import os
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

from server import services

DEFAULT_TIMEOUT = 120
_OUTPUT_LIMIT = 4000
_EXTRA_PATH = ["/opt/homebrew/bin", "/usr/local/bin", str(Path.home() / ".local" / "bin")]

_run_lock = threading.Lock()


def _child_env() -> dict[str, str]:
    env = dict(os.environ)
    path = env.get("PATH", "")
    missing = [p for p in _EXTRA_PATH if p not in path.split(os.pathsep)]
    if missing:
        env["PATH"] = os.pathsep.join([path, *missing]) if path else os.pathsep.join(missing)
    return env


def _steps(svc: dict, unit_id: str | None, op: str | None, action_id: str | None) -> list[tuple[str, str]]:
    if action_id:
        action = next((a for a in svc["actions"] if a["id"] == action_id), None)
        if action is None:
            raise ValueError(f"Unknown action: {action_id}")
        return [(action["label"], action["command"])]
    unit = next((u for u in svc["units"] if u["id"] == unit_id), None)
    if unit is None:
        raise ValueError(f"Unknown unit: {unit_id}")
    if op == "start" and unit["start"]:
        return [(f"start {unit['name']}", unit["start"])]
    if op == "stop" and unit["stop"]:
        return [(f"stop {unit['name']}", unit["stop"])]
    if op == "restart" and unit["start"] and unit["stop"]:
        return [(f"stop {unit['name']}", unit["stop"]), (f"start {unit['name']}", unit["start"])]
    raise ValueError(f"{svc['name']} has no '{op}' command for unit '{unit_id}'")


def _detached(svc: dict, action_id: str | None) -> bool:
    if action_id:
        action = next((a for a in svc["actions"] if a["id"] == action_id), None)
        return bool(action and action["detached"])
    return bool(svc["detached"])


def run_action(
    service_id: str,
    unit_id: str | None = None,
    op: str | None = None,
    action_id: str | None = None,
) -> dict:
    svc = services.get(service_id)
    if svc is None:
        raise ValueError(f"Unknown service: {service_id}")
    steps = _steps(svc, unit_id, op, action_id)
    detached = _detached(svc, action_id)
    timeout = int(os.environ.get("ROZ_SERVICE_TIMEOUT", DEFAULT_TIMEOUT))
    env = _child_env()

    with _run_lock:
        results: list[dict[str, Any]] = []
        for label, command in steps:
            started = time.monotonic()
            entry: dict[str, Any] = {"label": label, "command": command, "detached": detached}
            if detached:
                subprocess.Popen(  # noqa: S602 - command is manifest-authored
                    command, shell=True, cwd=svc["dir"], env=env,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
                entry.update({"exit_code": 0, "stdout": "", "stderr": ""})
            else:
                try:
                    run = subprocess.run(  # noqa: S602 - command is manifest-authored
                        command, shell=True, cwd=svc["dir"], env=env,
                        capture_output=True, text=True, timeout=timeout,
                    )
                    entry.update({
                        "exit_code": run.returncode,
                        "stdout": run.stdout[-_OUTPUT_LIMIT:],
                        "stderr": run.stderr[-_OUTPUT_LIMIT:],
                    })
                except subprocess.TimeoutExpired:
                    entry.update({
                        "exit_code": 124,
                        "stdout": "",
                        "stderr": f"timed out after {timeout}s",
                    })
            entry["duration_ms"] = int((time.monotonic() - started) * 1000)
            results.append(entry)

    return {
        "ok": all(r["exit_code"] == 0 for r in results),
        "detached": detached,
        "service": svc["id"],
        "steps": results,
    }
