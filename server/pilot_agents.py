"""Agent personas for pi runs.

pi 1.3 dropped the ``--agent`` flag, so an agent is a markdown persona appended
to the system prompt. ``PI_AGENTS_DIR`` holds one ``<name>.md`` per agent.
"""

from __future__ import annotations

import os
from pathlib import Path


def agents_dir() -> str:
    return os.environ.get("PI_AGENTS_DIR", "").strip()


def persona_path(agent: str | None) -> Path | None:
    """Resolve `<agents_dir>/<agent>.md`, ignoring empty/unset/non-existent names."""
    name = (agent or "").strip()
    if not name or name == "none":
        return None
    base = agents_dir()
    if not base:
        return None
    candidate = Path(os.path.expanduser(base)) / f"{name}.md"
    return candidate if candidate.is_file() else None


def available_agents() -> list[str]:
    """Agent names that actually have a persona file on disk."""
    base = agents_dir()
    if not base:
        return []
    directory = Path(os.path.expanduser(base))
    if not directory.is_dir():
        return []
    return sorted(path.stem for path in directory.glob("*.md"))


