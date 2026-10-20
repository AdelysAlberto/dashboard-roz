"""Read-only scanner for agent skills: ``<root>/<skill>/SKILL.md``.

This module never writes inside a skill directory. The taxonomy (category and
tags) lives in Roz's own overlay index (``server/skills_index.py``), so tagging
can never break skill discovery in Pi, OpenCode or Claude: those loaders only
read ``SKILL.md`` frontmatter, and we do not touch it.

Classification order, highest authority first:
  1. overlay index (manual tag or a previous LLM analysis)
  2. ``metadata.category`` declared inside the skill's own frontmatter
     (legal per the Agent Skills spec, ignored by the loaders)
  3. keyword heuristic over name + description
"""

from __future__ import annotations

import hashlib
import os
import re
import threading
import time
from pathlib import Path

import yaml

from server.skills_taxonomy import CATEGORY_KEYS, classify

SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build",
    ".next", ".cache", "assets", "references", "scripts", "examples", "kit",
}
FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.DOTALL)
MAX_DEPTH = 2          # skills/<name>/SKILL.md and skills/<group>/<name>/SKILL.md
CACHE_TTL = 5.0

_cache: dict = {"at": 0.0, "roots": [], "skills": []}
_lock = threading.Lock()


def roots() -> list[Path]:
    """Configured skill directories (``ROZ_SKILLS_DIRS``, comma separated)."""
    raw = os.environ.get("ROZ_SKILLS_DIRS", "")
    out: list[Path] = []
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        p = Path(chunk).expanduser()
        if p not in out:
            out.append(p)
    return out


def source_label(root: Path) -> str:
    """Disambiguate the usual ``.../agents-<x>/skills`` layout by its parent."""
    parts = root.resolve().parts
    if root.name in ("skills", "skill") and len(parts) > 1:
        return parts[-2]
    return root.name or str(root)


def _read_frontmatter(text: str) -> dict:
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}
    try:
        data = yaml.safe_load(m.group(1))
    except yaml.YAMLError:
        return {}
    return data if isinstance(data, dict) else {}


def strip_frontmatter(text: str) -> str:
    m = FRONTMATTER_RE.match(text)
    return text[m.end():] if m else text


def _summary(description: str, limit: int = 200) -> str:
    flat = " ".join(description.split())
    if len(flat) <= limit:
        return flat
    cut = flat[:limit]
    dot = cut.rfind(". ")
    return (cut[: dot + 1] if dot > 80 else cut.rstrip() + "…")


def _list_files(skill_dir: Path, limit: int = 80) -> tuple[list[dict], int, int]:
    files: list[dict] = []
    total = 0
    total_bytes = 0
    for base, dirs, names in os.walk(skill_dir):
        rel = Path(base).relative_to(skill_dir)
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]
        if len(rel.parts) >= 3:
            dirs[:] = []
        for n in sorted(names):
            if n.startswith("."):
                continue
            p = Path(base) / n
            try:
                size = p.stat().st_size
            except OSError:
                continue
            total += 1
            total_bytes += size
            if len(files) < limit:
                files.append({"path": str(rel / n) if rel.parts else n, "size": size})
    return files, total, total_bytes


def _scan_root(root: Path) -> list[dict]:
    label = source_label(root)
    found: list[dict] = []
    if not root.is_dir():
        return found
    stack: list[tuple[Path, int]] = [(root, 0)]
    while stack:
        current, depth = stack.pop()
        try:
            children = sorted(p for p in current.iterdir() if p.is_dir())
        except OSError:
            continue
        for child in children:
            if child.name.startswith(".") or child.name in SKIP_DIRS:
                continue
            skill_md = child / "SKILL.md"
            if skill_md.is_file():
                found.append(_build_skill(child, skill_md, root, label))
            elif depth + 1 < MAX_DEPTH:
                stack.append((child, depth + 1))
    return found


def _build_skill(skill_dir: Path, skill_md: Path, root: Path, label: str) -> dict:
    try:
        text = skill_md.read_text(encoding="utf-8", errors="replace")
    except OSError:
        text = ""
    meta = _read_frontmatter(text)
    name = str(meta.get("name") or skill_dir.name)
    description = str(meta.get("description") or "")
    declared = meta.get("metadata") if isinstance(meta.get("metadata"), dict) else {}
    declared_category = str(declared.get("category") or "").strip().lower()
    files, file_count, total_bytes = _list_files(skill_dir)
    rel = skill_dir.relative_to(root)
    return {
        "id": f"{label}/{rel.as_posix()}",
        "name": name,
        "dir_name": skill_dir.name,
        "source": label,
        "root": str(root),
        "path": str(skill_md),
        "rel_path": rel.as_posix(),
        "description": description,
        "summary": _summary(description),
        "license": str(meta.get("license") or ""),
        "declared_category": declared_category if declared_category in CATEGORY_KEYS else "",
        "auto_category": classify(skill_dir.name + " " + name, description, skill_dir.name),
        "tags": [],
        "files": files,
        "file_count": file_count,
        "bytes": total_bytes,
        "line_count": text.count("\n") + (1 if text else 0),
        "content_hash": hashlib.sha256(text.encode("utf-8")).hexdigest()[:16],
        "_content": text,
    }


def scan(force: bool = False) -> list[dict]:
    """All skills across the configured roots. Cached for ``CACHE_TTL`` seconds."""
    with _lock:
        fresh = time.time() - _cache["at"] < CACHE_TTL
        if fresh and not force:
            return _cache["skills"]
        skills: list[dict] = []
        seen: set[str] = set()
        for root in roots():
            for skill in _scan_root(root):
                if skill["id"] in seen:
                    continue
                seen.add(skill["id"])
                skills.append(skill)
        skills.sort(key=lambda s: (s["source"], s["dir_name"]))
        _cache.update({"at": time.time(), "skills": skills})
        return skills


def root_status() -> list[dict]:
    skills = scan()
    out = []
    for root in roots():
        label = source_label(root)
        out.append({
            "label": label,
            "path": str(root),
            "exists": root.is_dir(),
            "count": sum(1 for s in skills if s["source"] == label),
        })
    return out


def find(skill_id: str) -> dict | None:
    for skill in scan():
        if skill["id"] == skill_id:
            return skill
    return None


def read_content(skill: dict) -> str:
    return skill.get("_content", "")


def public(skill: dict) -> dict:
    """Drop the private, expensive fields (the raw file body) before serializing."""
    return {k: v for k, v in skill.items() if not k.startswith("_")}
