"""Monitor agent processes across multiple providers (Pi, OpenCode, etc.)."""

from __future__ import annotations

from typing import Any

from server.providers import registry


def _session_sort_key(s: dict):
    state_prio = (
        0 if s.get("state") == "active"
        else 1 if s.get("state") == "quiet"
        else 2 if s.get("state") == "stalled"
        else 3
    )
    kind_prio = 0 if s.get("kind") == "subagent" else 1
    return (state_prio, kind_prio, s.get("idle_seconds", 999999), -s.get("size", 0))


def list_sessions(project_cwds: list[str]) -> list[dict[str, Any]]:
    sessions = registry.list_all_sessions(project_cwds)
    sessions.sort(key=_session_sort_key)
    return sessions


def tail_log(path: str, lines: int = 120) -> list[dict[str, Any]]:
    provider = registry.resolve_provider(path)
    if not provider:
        raise ValueError(f"No provider found to handle target: {path}")
    return provider.tail_log(path, lines=lines)


def kill_session(path: str) -> int:
    provider = registry.resolve_provider(path)
    if not provider:
        raise ValueError(f"No provider found to handle target: {path}")
    return provider.kill_session(path)
