"""Base interface for agent execution and monitoring providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BaseAgentProvider(ABC):
    """Abstract base provider for monitoring background agents and subagents."""

    name: str

    @abstractmethod
    def list_sessions(self, project_cwds: list[str]) -> list[dict[str, Any]]:
        """List active and historical sessions normalized for Roz dashboard.

        Must include fields:
            provider: str
            path: str (unique identifier or file path)
            id: str
            kind: "primary" | "subagent"
            agent: str
            project: str
            task: str
            task_tag: str
            state: "active" | "quiet" | "stalled" | "ended"
            messages: int
            tokens: int
            cost: float
            idle_seconds: int
            started: str
            updated: str
            pid: int | None
            last_activity: str
            size: int
        """
        pass

    @abstractmethod
    def tail_log(self, target: str, lines: int = 120) -> list[dict[str, Any]]:
        """Return formatted log events for a given session.

        Each event should have:
            ts: str
            kind: "tool" | "result" | "user" | "text" | "thinking"
            text: str
            tool: str (optional)
        """
        pass

    @abstractmethod
    def kill_session(self, target: str) -> int:
        """Terminate a running agent process by sending SIGTERM or abort signal."""
        pass
