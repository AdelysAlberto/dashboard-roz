"""Base interface for agent execution and monitoring providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

# Interrupt ladder, weakest first. Every provider advertises which rungs it can
# actually reach in `interrupt_levels`; claiming a level it cannot honour would
# let the dashboard send a signal that silently does nothing.
#   tool — kill the process(es) of the tool call in flight. The turn resumes
#          with a failed tool result and the session keeps its context.
#   turn — abort the agent turn but keep the session alive and resumable.
#   kill — terminate the agent process. Context survives only in the JSONL.
INTERRUPT_LEVELS: tuple[str, ...] = ("tool", "turn", "kill")


@dataclass(frozen=True)
class InterruptOutcome:
    """Result of one interrupt request.

    `ok=False` is a normal answer, not an exception: the caller shows `detail`
    verbatim. `pids` lists what was actually signalled, so the audit log can be
    checked against `ps` after the fact.
    """

    ok: bool
    provider: str
    level: str
    detail: str
    pids: tuple[int, ...] = ()
    targets: tuple[str, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "provider": self.provider,
            "level": self.level,
            "detail": self.detail,
            "pids": list(self.pids),
            "targets": list(self.targets),
        }


class BaseAgentProvider(ABC):
    """Abstract base provider for monitoring background agents and subagents."""

    name: str
    interrupt_levels: tuple[str, ...] = ("kill",)

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
            interrupt_levels: list[str]
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
    def interrupt(self, target: str, level: str = "tool") -> InterruptOutcome:
        """Interrupt `target` at `level`.

        `tool` must never touch the agent process. `kill` is the last resort and
        must not terminate infrastructure shared by other sessions.
        """
        pass

    def kill_session(self, target: str) -> int:
        """Legacy entry point: terminate the agent process, return its pid."""
        outcome = self.interrupt(target, "kill")
        if not outcome.ok:
            raise RuntimeError(outcome.detail)
        return outcome.pids[0] if outcome.pids else 0
