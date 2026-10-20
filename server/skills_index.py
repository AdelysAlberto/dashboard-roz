"""Roz's own skill overlay index: category, tags and the LLM analysis per skill.

This is the *only* place Roz persists anything about a skill. The skill
directories under ``ROZ_SKILLS_DIRS`` are treated as read-only, so a bad tag
can never make an agent lose a skill.

File shape (``ROZ_SKILLS_INDEX``, default ``.roz_skills.json``)::

    {"version": 1, "skills": {"<source>/<dir>": {
        "category": "design", "tags": ["ui", "polish"],
        "analysis": "markdown…", "analyzed_at": "2026-…",
        "model": "dell3-heretic", "content_hash": "ab12…"}}}
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
_lock = threading.Lock()


def index_path() -> Path:
    configured = os.environ.get("ROZ_SKILLS_INDEX", "").strip()
    if not configured:
        return BASE / ".roz_skills.json"
    p = Path(configured).expanduser()
    return p if p.is_absolute() else BASE / p


def load() -> dict:
    path = index_path()
    if not path.is_file():
        return {"version": 1, "skills": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"version": 1, "skills": {}}
    if not isinstance(data, dict) or not isinstance(data.get("skills"), dict):
        return {"version": 1, "skills": {}}
    data.setdefault("version", 1)
    return data


def _save(data: dict) -> None:
    path = index_path()
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def entry(skill_id: str) -> dict:
    with _lock:
        return dict(load()["skills"].get(skill_id) or {})


def update(skill_id: str, patch: dict) -> dict:
    with _lock:
        data = load()
        current = dict(data["skills"].get(skill_id) or {})
        current.update({k: v for k, v in patch.items() if v is not None})
        data["skills"][skill_id] = current
        _save(data)
        return current


def forget(skill_id: str) -> None:
    with _lock:
        data = load()
        if data["skills"].pop(skill_id, None) is not None:
            _save(data)


def prune(known_ids: set[str]) -> list[str]:
    """Drop entries whose skill no longer exists. Returns the removed ids."""
    with _lock:
        data = load()
        orphans = [k for k in data["skills"] if k not in known_ids]
        if orphans:
            for k in orphans:
                data["skills"].pop(k, None)
            _save(data)
        return orphans


def merge(skill: dict) -> dict:
    """Apply the overlay onto a scanned skill (category authority + extras)."""
    ov = entry(skill["id"])
    category = str(ov.get("category") or "").strip().lower()
    if category:
        source = str(ov.get("category_source") or "manual")
    elif skill.get("declared_category"):
        category, source = skill["declared_category"], "declared"
    else:
        category, source = skill["auto_category"], "auto"
    analyzed_at = ov.get("analyzed_at") or None
    hash_at_analysis = ov.get("content_hash")
    return {
        **skill,
        "category": category,
        "category_source": source,
        "tags": list(ov.get("tags") or []),
        "analysis": ov.get("analysis") or "",
        "summary_es": ov.get("summary_es") or "",
        "analyzed_at": analyzed_at,
        "model": ov.get("model") or "",
        "analysis_stale": bool(
            hash_at_analysis and hash_at_analysis != skill.get("content_hash")
        ),
    }
