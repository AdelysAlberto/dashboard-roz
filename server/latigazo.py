"""Latigazo: interrupt ladder plus the watchdog that applies it unattended.

`decide` is pure: state and numbers in, one decision out. The executor is
injected so this module never imports the provider registry (no cycle) and the
decision can be tested without touching a process.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Callable

# A tool that has held the turn for this long is assumed wedged, not busy.
# Override per deployment: a 20 minute migration is legitimate, a 20 minute
# grep over 25 GB is not. Only `tool` is cut, and only for `stalled` sessions.
DEFAULT_TOOL_SECONDS = int(os.environ.get("ROZ_LATIGAZO_TOOL_SECONDS", "300"))
# Do not re-cut the same session more often than this: after a cut the session
# needs a moment to write the tool result and resume the turn.
DEFAULT_COOLDOWN_SECONDS = int(os.environ.get("ROZ_LATIGAZO_COOLDOWN", "120"))
AUTO_ENABLED = os.environ.get("ROZ_LATIGAZO_AUTO", "1") not in ("0", "false", "no")

_AUDIT_LIMIT = 20
_audit: list[dict[str, Any]] = []
_last_cut: dict[str, float] = {}


@dataclass(frozen=True)
class Cut:
    """One watchdog decision. `level` is an interrupt-ladder rung."""

    level: str
    reason: str


def decide(
    state: str,
    idle_seconds: int,
    threshold: int,
    *,
    cooled: bool,
    levels: tuple[str, ...] | list[str] = ("tool",),
) -> Cut | None:
    """Decide whether one session needs a cut. No side effects.

    Only `stalled` qualifies: the provider already established that the agent
    holds the turn with a tool in flight (see the `in_flight` rule in the pi
    provider). `quiet` and `active` are left alone.
    """
    if state != "stalled":
        return None
    if idle_seconds < threshold:
        return None
    if not cooled:
        return None
    if "tool" not in levels:
        return None
    return Cut(
        level="tool",
        reason=f"tool en vuelo sin salida desde hace {idle_seconds}s (umbral {threshold}s)",
    )


def _record(entry: dict[str, Any]) -> None:
    _audit.append(entry)
    if len(_audit) > _AUDIT_LIMIT:
        del _audit[0]


def audit() -> list[dict[str, Any]]:
    """Most recent watchdog actions, newest last. Read-only copy."""
    return [dict(item) for item in _audit]


def reset() -> None:
    """Clear throttle and audit state (tests, and after an operator restart)."""
    _audit.clear()
    _last_cut.clear()


def run(
    sessions: list[dict[str, Any]],
    interrupt: Callable[[str, str], dict[str, Any]],
    *,
    threshold: int | None = None,
    cooldown: int = DEFAULT_COOLDOWN_SECONDS,
    now: float | None = None,
) -> list[dict[str, Any]]:
    """Apply the ladder to every stalled session past the threshold.

    Returns the actions taken. `interrupt(path, level)` is the injected
    executor; failures are recorded, never raised, so one dead provider cannot
    stop the watchdog for the rest.
    """
    if not AUTO_ENABLED:
        return []
    limit = DEFAULT_TOOL_SECONDS if threshold is None else threshold
    clock = time.time() if now is None else now
    actions: list[dict[str, Any]] = []
    for session in sessions:
        path = str(session.get("path") or "")
        if not path:
            continue
        levels = session.get("interrupt_levels") or ("tool",)
        cut = decide(
            str(session.get("state") or ""),
            int(session.get("idle_seconds") or 0),
            limit,
            cooled=(clock - _last_cut.get(path, 0.0)) >= cooldown,
            levels=levels,
        )
        if cut is None:
            continue
        _last_cut[path] = clock
        try:
            outcome = interrupt(path, cut.level)
        except Exception as e:  # noqa: BLE001
            outcome = {"ok": False, "detail": f"{type(e).__name__}: {e}"}
        entry = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(clock)),
            "path": path,
            "agent": session.get("agent") or "",
            "provider": session.get("provider") or "",
            "level": cut.level,
            "reason": cut.reason,
            "ok": bool(outcome.get("ok")),
            "detail": str(outcome.get("detail") or ""),
        }
        _record(entry)
        actions.append(entry)
    return actions
