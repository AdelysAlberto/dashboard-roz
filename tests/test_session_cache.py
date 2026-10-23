"""Cache semantics: keyed by file identity, copies out, clearable.

Run with: .venv/bin/python -m unittest discover -s tests -t .
"""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from server import session_cache


class SessionCacheTest(unittest.TestCase):
    def setUp(self):
        session_cache.clear()
        self.dir = tempfile.TemporaryDirectory()
        self.file = Path(self.dir.name) / "session.jsonl"
        self.file.write_text("first\n", encoding="utf-8")
        self.builds = 0

    def tearDown(self):
        session_cache.clear()
        self.dir.cleanup()

    def _build(self, path: Path) -> dict:
        self.builds += 1
        return {"content": path.read_text(encoding="utf-8")}

    def _delta(self, before: dict[str, int], key: str) -> int:
        """Stats are cumulative across the process, so tests compare deltas."""
        return session_cache.stats()[key] - before.get(key, 0)

    def test_second_read_is_served_from_cache(self):
        before = session_cache.stats()
        first = session_cache.get_or_build(self.file, self._build)
        second = session_cache.get_or_build(self.file, self._build)
        self.assertEqual(first, second)
        self.assertEqual(self.builds, 1)
        self.assertEqual(self._delta(before, "hits"), 1)
        self.assertEqual(self._delta(before, "misses"), 1)

    def test_appending_invalidates_the_entry(self):
        session_cache.get_or_build(self.file, self._build)
        with self.file.open("a", encoding="utf-8") as fh:
            fh.write("second\n")
        fresh = session_cache.get_or_build(self.file, self._build)
        self.assertEqual(self.builds, 2)
        self.assertIn("second", fresh["content"])

    def test_same_size_rewrite_invalidates_by_mtime(self):
        session_cache.get_or_build(self.file, self._build)
        st = self.file.stat()
        self.file.write_text("other\n", encoding="utf-8")
        os.utime(self.file, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000_000))
        session_cache.get_or_build(self.file, self._build)
        self.assertEqual(self.builds, 2)

    def test_clear_forces_a_rebuild(self):
        before = session_cache.stats()
        session_cache.get_or_build(self.file, self._build)
        session_cache.clear()
        session_cache.get_or_build(self.file, self._build)
        self.assertEqual(self.builds, 2)
        self.assertEqual(self._delta(before, "clears"), 1)

    def test_callers_get_a_copy(self):
        first = session_cache.get_or_build(self.file, self._build)
        first["latigazo"] = {"level": "tool"}
        second = session_cache.get_or_build(self.file, self._build)
        self.assertNotIn("latigazo", second)

    def test_namespaces_do_not_collide(self):
        session_cache.get_or_build(self.file, lambda p: {"shape": "facts"})
        other = session_cache.get_or_build(self.file, lambda p: {"shape": "calls"}, namespace="calls")
        self.assertEqual(other["shape"], "calls")

    def test_missing_file_falls_through_without_caching(self):
        gone = Path(self.dir.name) / "nope.jsonl"
        before = session_cache.stats()["entries"]
        result = session_cache.get_or_build(gone, lambda p: {"built": True})
        self.assertTrue(result["built"])
        self.assertEqual(session_cache.stats()["entries"], before)


if __name__ == "__main__":
    unittest.main()
