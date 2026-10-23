"""Cache of parsed session facts, keyed by (mtime_ns, size).

Listing 275 sessions used to re-read 218 JSONL files and 128 MB of transcript on
every poll, every 4 seconds. What actually changes between polls is the file, so
the cache key is the file identity: a rewritten or appended file misses, an
untouched one hits and costs a `stat`.

Only file facts are cached (`header`, counts, tail markers). Anything that
depends on the process table or on a name map is derived afterwards by the
provider, because those change without the file changing.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any, Callable

MAX_ENTRIES = 1000

_lock = threading.Lock()
_entries: dict[str, tuple[tuple[int, int], dict[str, Any]]] = {}
_stats = {"hits": 0, "misses": 0, "evictions": 0, "clears": 0}


def _identity(path: Path) -> tuple[int, int]:
    st = path.stat()
    return (st.st_mtime_ns, st.st_size)


def get_or_build(
    path: Path,
    build: Callable[[Path], dict[str, Any]],
    namespace: str = "facts",
) -> dict[str, Any]:
    """Return the cached value for `path`, building it on a miss.

    `namespace` keeps unrelated extractions of the same file apart, so a
    transcript can be cached both as session facts and as subagent calls.
    The returned dict is a shallow copy: callers annotate sessions (project
    label, interrupt levels, watchdog actions) and must not corrupt the entry.
    """
    key = f"{namespace}:{path}"
    try:
        identity = _identity(path)
    except OSError:
        return build(path)
    with _lock:
        entry = _entries.get(key)
        if entry is not None and entry[0] == identity:
            _stats["hits"] += 1
            return dict(entry[1])
        _stats["misses"] += 1
    facts = build(path)
    with _lock:
        if len(_entries) >= MAX_ENTRIES:
            # Oldest insertion first: dict preserves order, and a miss is cheap
            # next poll compared to unbounded growth.
            _entries.pop(next(iter(_entries)), None)
            _stats["evictions"] += 1
        _entries[key] = (identity, facts)
    return dict(facts)


def clear() -> None:
    """Drop every entry. Next listing rebuilds from disk."""
    with _lock:
        _entries.clear()
        _stats["clears"] += 1


def stats() -> dict[str, int]:
    with _lock:
        return {**_stats, "entries": len(_entries)}
