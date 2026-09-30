"""Provider registry for agent execution and monitoring."""

from __future__ import annotations

from typing import Any

from server.providers.base import BaseAgentProvider
from server.providers.opencode_provider import OpenCodeAgentProvider
from server.providers.pi_provider import PiAgentProvider

DEFAULT_PROVIDERS: list[BaseAgentProvider] = [
    PiAgentProvider(),
    OpenCodeAgentProvider(),
]


class ProviderRegistry:
    def __init__(self, providers: list[BaseAgentProvider] | None = None):
        self._providers: dict[str, BaseAgentProvider] = {}
        for p in (providers or DEFAULT_PROVIDERS):
            self.register(p)

    def register(self, provider: BaseAgentProvider):
        self._providers[provider.name] = provider

    def get(self, name: str) -> BaseAgentProvider | None:
        return self._providers.get(name)

    def list_all_sessions(self, project_cwds: list[str]) -> list[dict[str, Any]]:
        all_sessions: list[dict[str, Any]] = []
        for provider in self._providers.values():
            try:
                sessions = provider.list_sessions(project_cwds)
                all_sessions.extend(sessions)
            except Exception as e:  # noqa: BLE001
                print(f"[providers.{provider.name}] Error listing sessions: {e}")
        return all_sessions

    def resolve_provider(self, target: str) -> BaseAgentProvider | None:
        if target.startswith("opencode://"):
            return self.get("opencode")
        # Default or check file path
        return self.get("pi")


registry = ProviderRegistry()
