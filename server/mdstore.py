"""Scanning, parsing and safe file actions for markdown documents."""

from __future__ import annotations

import os
import re
import shutil
import threading
from pathlib import Path

import yaml

SCAN_SKIP_DIRS = {".git", "node_modules", ".venv", "__pycache__", "dist", "build", ".next"}

# Project convention: canonical vocabulary.
STATUS_VALUES = (
    "pending",
    "in progress",
    "in_progress",
    "done",
    "blocked",
    "rejected",
    "deprecated",
)

_lock = threading.Lock()
_scan_roots: list[Path] = []
_roots_file = Path(__file__).resolve().parent.parent / ".roz_roots.json"


def _persist_roots() -> None:
    import json
    _roots_file.write_text(json.dumps([str(r) for r in _scan_roots], indent=1), encoding="utf-8")


def _load_persisted() -> list[str]:
    import json
    if _roots_file.is_file():
        try:
            return json.loads(_roots_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return []
    return []


# ── scan roots ─────────────────────────────────────────────────────────

def init_roots(paths: list[str]) -> None:
    for p in paths + _load_persisted():
        try:
            add_root(p, persist=False)
        except ValueError:
            pass  # skip misconfigured/deleted paths at startup


def add_root(path: str, persist: bool = True) -> str:
    p = Path(path).expanduser().resolve()
    if not p.is_dir():
        raise ValueError(f"Not a directory: {path}")
    with _lock:
        if p not in _scan_roots:
            _scan_roots.append(p)
            if persist:
                _persist_roots()
    return str(p)


def remove_root(path: str) -> None:
    p = Path(path).expanduser().resolve()
    with _lock:
        if p in _scan_roots:
            _scan_roots.remove(p)
            _persist_roots()


def list_roots() -> list[str]:
    with _lock:
        return [str(r) for r in _scan_roots]


def _within_roots(fp: Path) -> bool:
    with _lock:
        roots = list(_scan_roots)
    return any(fp == r or r in fp.parents for r in roots)


def _safe_file(path: str) -> Path:
    fp = Path(path).expanduser().resolve()
    if not fp.is_file() or fp.suffix.lower() != ".md":
        raise ValueError("Not a markdown file")
    if not _within_roots(fp):
        raise ValueError("File is outside the registered scan paths")
    return fp


# ── parsing ────────────────────────────────────────────────────────────

FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.DOTALL)
# Matches a header table row like:  | Status | Pending |  (also with :--- alignment separators)
TABLE_ROW_RE = re.compile(r"^(\|[^|\n]+\|)\s*([A-Za-z _-]+?)\s*\|\s*(.*?)\s*\|?\s*$")


def _parse_frontmatter(text: str) -> tuple[dict | None, str]:
    m = FRONTMATTER_RE.match(text)
    if not m:
        return None, text
    try:
        data = yaml.safe_load(m.group(1))
    except yaml.YAMLError:
        return None, text
    if not isinstance(data, dict):
        return None, text
    return data, text[m.end():]


def _parse_header_table(text: str) -> tuple[dict | None, list[tuple[int, int]]]:
    """Detect a `| Field | Value |` metadata table. Returns (fields, line_spans)."""
    fields: dict[str, str] = {}
    spans: list[tuple[int, int]] = []
    lines = text.splitlines(keepends=True)
    offset = 0
    in_table = False
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not in_table and i < 40 and stripped.startswith("|") and re.search(r"Field", stripped, re.I):
            in_table = True
        if not in_table:
            offset += len(line)
            continue
        if not stripped.startswith("|"):
            if fields:
                break
            offset += len(line)
            continue
        m = re.match(r"^\|([^|]+)\|([^|]*)\|?\s*$", stripped)
        if m and not re.match(r"^:?-{2,}:?$", m.group(1).strip()):
            key = m.group(1).strip()
            val = m.group(2).strip()
            if key.lower() not in ("field", "value"):
                fields[key] = val
                spans.append((offset, offset + len(line)))
        offset += len(line)
    return (fields if fields else None), spans


_H1_RE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)


def parse_document(fp: Path) -> dict:
    text = fp.read_text(encoding="utf-8", errors="replace")
    meta: dict = {}
    body = text

    fm, rest = _parse_frontmatter(text)
    if fm:
        meta = {str(k): _flatten(v) for k, v in fm.items()}
        body = rest
    else:
        table_fields, _ = _parse_header_table(text)
        if table_fields:
            meta = table_fields
            body = text

    # Extract H1 title regardless of frontmatter
    h1_match = _H1_RE.search(text)
    title_from_h1 = h1_match.group(1).strip() if h1_match else None

    def get(*names):
        for n in names:
            for k, v in meta.items():
                if k.lower() == n.lower() and v:
                    return v
        return None

    def clean_description(src: str) -> str:
        explicit_desc = get("description", "summary", "descripcion", "resumen")
        if explicit_desc:
            return explicit_desc

        in_desc = False
        para: list[str] = []
        for ln in src.splitlines():
            s = ln.strip()
            if re.match(r"^#{1,6}\s*description\b", s, re.I):
                in_desc = True
                continue
            if in_desc and s.startswith("#"):
                break
            if in_desc:
                if s:
                    para.append(s)
                elif para:
                    break
        if para:
            return " ".join(para)

        # Fallback: find first real narrative paragraph (ignore metadata blocks like **Key:** value)
        for block in re.split(r"\n\s*\n", src):
            b = block.strip()
            # Ignore headings, tables, frontmatter delimiters, and key-value lists
            if (
                b
                and not b.startswith("#")
                and not b.startswith("|")
                and not b.startswith("---")
                and not re.match(r"^\*\*[^*]+:\*\*", b)
                and not re.match(r"^[-*+]\s", b)
            ):
                return b[:300]
        return ""

    status = (get("status", "estado") or "").strip().lower()
    title = get("name", "title", "titulo") or title_from_h1 or fp.stem
    priority = get("priority", "prioridad", "criticality", "criticidad")
    date = get("date", "fecha", "updated", "created", "last_updated")

    return {
        "path": str(fp),
        "parent": str(fp.parent),
        "name": fp.name,
        "root": _root_of(fp),
        "title": title,
        "status": status,
        "module": get("module", "area", "modulo"),
        "date": date,
        "priority": priority,
        "scope": get("scope", "alcance"),
        "source": get("source"),
        "has_frontmatter": fm is not None,
        "raw_meta": meta,
        "description": clean_description(body),
    }


def _flatten(v) -> str:
    import datetime
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.isoformat()
    if isinstance(v, (str, int, float, bool)):
        return str(v)
    if isinstance(v, list):
        return ", ".join(_flatten(x) for x in v)
    dumped = yaml.safe_dump(v, default_flow_style=True).strip()
    if dumped.endswith("..."):
        dumped = dumped[:-3].strip()
    return dumped


def _root_of(fp: Path) -> str:
    with _lock:
        roots = list(_scan_roots)
    for r in roots:
        if r in fp.parents or r == fp:
            return str(r)
    return ""


# ── scanning ───────────────────────────────────────────────────────────

def scan_all() -> list[dict]:
    docs = []
    with _lock:
        roots = list(_scan_roots)
    for root in roots:
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SCAN_SKIP_DIRS and not d.startswith(".")]
            for fn in filenames:
                if fn.lower().endswith(".md"):
                    fp = Path(dirpath) / fn
                    try:
                        docs.append(parse_document(fp))
                    except OSError:
                        continue
    docs.sort(key=lambda d: (d["root"], d["path"]))
    return docs


# ── actions ────────────────────────────────────────────────────────────

def set_status(path: str, status: str) -> dict:
    status = status.strip().lower()
    if status not in STATUS_VALUES:
        raise ValueError(f"status must be one of {STATUS_VALUES}")
    fp = _safe_file(path)
    text = fp.read_text(encoding="utf-8")

    # 1) YAML frontmatter
    m = FRONTMATTER_RE.match(text)
    if m:
        block = m.group(1)
        if re.search(r"^status\s*:", block, re.MULTILINE | re.IGNORECASE):
            new_block = re.sub(r"(?im)^status\s*:.*$", f"status: {status}", block)
        else:
            new_block = block.rstrip("\n") + f"\nstatus: {status}\n"
        if not new_block.endswith("\n"):
            new_block += "\n"
        text = f"---\n{new_block}---\n" + text[m.end():]
        fp.write_text(text, encoding="utf-8")
        return parse_document(fp)

    # 2) Header table row  | Status | ... |
    lines = text.splitlines(keepends=True)
    for i, line in enumerate(lines[:40]):
        if re.match(r"^\|\s*status\s*\|", line.strip(), re.IGNORECASE):
            lines[i] = re.sub(r"^(\|\s*[Ss]tatus\s*\|)\s*[^|\n]*\|", rf"\g<1> {status} |", line.rstrip("\n")) + "\n"
            fp.write_text("".join(lines), encoding="utf-8")
            return parse_document(fp)

    # 3) Neither: inject a minimal frontmatter at the top
    text = f"---\nstatus: {status}\n---\n\n" + text
    fp.write_text(text, encoding="utf-8")
    return parse_document(fp)


def move_file(path: str, dest_dir: str) -> dict:
    fp = _safe_file(path)
    dest = Path(dest_dir).expanduser().resolve()
    dest.mkdir(parents=True, exist_ok=True)
    if not _within_roots(dest):
        # allow moving within the same tree as the source
        if dest != fp.parent and fp.parent not in dest.parents and dest not in fp.parent.parents:
            raise ValueError("Destination outside registered scan paths")
    target = dest / fp.name
    if target.exists():
        stem, suffix = fp.stem, fp.suffix
        n = 1
        while (target := dest / f"{stem}-{n}{suffix}").exists():
            n += 1
    shutil.move(str(fp), str(target))
    return parse_document(target)


def delete_file(path: str) -> None:
    fp = _safe_file(path)
    fp.unlink()


def read_file(path: str) -> str:
    fp = _safe_file(path)
    return fp.read_text(encoding="utf-8", errors="replace")


# ── frontmatter validation ─────────────────────────────────────────────

def _iter_md_files() -> list[Path]:
    files: list[Path] = []
    with _lock:
        roots = list(_scan_roots)
    for root in roots:
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SCAN_SKIP_DIRS and not d.startswith(".")]
            for fn in filenames:
                if fn.lower().endswith(".md"):
                    files.append(Path(dirpath) / fn)
    return sorted(files)


def validate_all() -> dict:
    """Read-only audit of frontmatter convention drift across scan roots.

    Checks:
      - frontmatter_malformed: file starts with '---' but the YAML block does
        not close on its own line (e.g. glued 'updated: 2026-09-16---') or is
        not parseable YAML mapping.
      - status_not_canonical: status present but outside lowercase vocabulary.
      - missing_frontmatter / not_in_tags_map: only for roots that carry a
        .md_tags_map.json (tagged-pipeline roots).
    """
    issues: list[dict] = []
    files = _iter_md_files()
    for fp in files:
        try:
            text = fp.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            issues.append({"type": "unreadable", "path": str(fp), "detail": str(e)})
            continue
        if text.startswith("---"):
            fm, _ = _parse_frontmatter(text)
            if fm is None:
                issues.append({
                    "type": "frontmatter_malformed", "path": str(fp),
                    "detail": "YAML block not closed on its own line or not a mapping",
                })
                continue
            status = str(fm.get("status", "")).strip().lower()
            if status and status not in STATUS_VALUES:
                issues.append({
                    "type": "status_not_canonical", "path": str(fp),
                    "detail": f"status: {fm.get('status')!r} not in {list(STATUS_VALUES)}",
                })
    # tagged-pipeline roots: consistency with .md_tags_map.json
    with _lock:
        roots = list(_scan_roots)
    for root in roots:
        map_file = root / ".md_tags_map.json"
        if not map_file.is_file():
            continue
        try:
            tag_map = __import__("json").loads(map_file.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            issues.append({"type": "tags_map_unreadable", "path": str(map_file), "detail": str(e)})
            continue
        mapped = {str(Path(root) / k).lower() for k in tag_map}
        for fp in files:
            if root not in fp.parents and fp != root:
                continue
            if str(fp).lower() in mapped:
                continue
            if not fp.read_text(encoding="utf-8", errors="replace").startswith("---"):
                issues.append({
                    "type": "not_in_tags_map", "path": str(fp),
                    "detail": "no frontmatter and absent from .md_tags_map.json",
                })
    counts: dict[str, int] = {}
    for it in issues:
        counts[it["type"]] = counts.get(it["type"], 0) + 1
    return {"checked": len(files), "counts": counts, "issues": issues}
