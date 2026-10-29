"""JSON-lines bridge to one resident mflux worker process.

The child is `mflux_worker.py`, started with the interpreter that has mflux
(`ROZ_MFLUX_PYTHON`). This module owns the process and the wire; the state
machine that decides what to ask lives in `mflux_local`. Kept apart because the
two have different failure modes: a dead pipe is a transport problem, a request
that conflicts with the current state is not.

Every request gets an id of its own. The reply may arrive long after the call
that sent it — a load returns immediately — so a status line that belongs to a
previous request is dropped, never mistaken for this one.
"""

from __future__ import annotations

import json
import subprocess
import threading
import time
from collections import deque
from pathlib import Path
from queue import Empty, Queue
from typing import Callable


class WorkerError(RuntimeError):
    """The worker died, refused the request, or did not answer in time."""


class Bridge:
    def __init__(self, script: Path) -> None:
        self._script = script
        self._proc: subprocess.Popen | None = None
        self._inbox: Queue = Queue()
        self._tail: deque[str] = deque(maxlen=30)
        self._sequence = 0
        self._lock = threading.Lock()

    # ── process ────────────────────────────────────────────────────────
    def alive(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def pid(self) -> int | None:
        return self._proc.pid if self.alive() else None

    def start(self, python: str) -> None:
        try:
            self._proc = subprocess.Popen(
                [python, "-u", str(self._script)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except OSError as exc:
            raise WorkerError(f"cannot start {python}: {exc}") from exc
        self._tail.clear()
        while not self._inbox.empty():
            self._inbox.get_nowait()
        threading.Thread(target=self._read_stdout, args=(self._proc,), daemon=True).start()
        threading.Thread(target=self._read_stderr, args=(self._proc,), daemon=True).start()

    def stop(self) -> None:
        with self._lock:
            proc, self._proc = self._proc, None
        if proc is None:
            return
        try:
            if proc.poll() is None and proc.stdin is not None:
                proc.stdin.write(json.dumps({"op": "shutdown", "id": "bye"}) + "\n")
                proc.stdin.flush()
            proc.wait(timeout=3)
        except (OSError, subprocess.SubprocessError):
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
        for stream in (proc.stdin, proc.stdout, proc.stderr):
            try:
                if stream is not None:
                    stream.close()
            except OSError:
                continue

    # ── wire ───────────────────────────────────────────────────────────
    def request(
        self,
        op: str,
        timeout: float,
        on_progress: Callable[[dict], None] | None = None,
        **fields: object,
    ) -> dict:
        """Send one op and block until its reply. ``status``/``warning`` lines on
        the way are handed to ``on_progress``."""
        with self._lock:
            self._sequence += 1
            request_id = str(self._sequence)
        if not self.alive() or self._proc is None or self._proc.stdin is None:
            raise WorkerError(f"the mflux worker is not running{self._spoils()}")
        try:
            self._proc.stdin.write(
                json.dumps({"op": op, "id": request_id, **fields}, ensure_ascii=False) + "\n"
            )
            self._proc.stdin.flush()
        except OSError as exc:
            raise WorkerError(f"worker pipe closed: {exc}{self._spoils()}") from exc
        return self._wait(request_id, timeout, on_progress)

    def _wait(
        self, request_id: str, timeout: float, on_progress: Callable[[dict], None] | None
    ) -> dict:
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise WorkerError(f"the worker did not answer in {timeout:.0f}s")
            try:
                message = self._inbox.get(timeout=min(remaining, 1.0))
            except Empty:
                if not self.alive():
                    raise WorkerError(f"the worker exited{self._spoils()}") from None
                continue
            kind = message.get("type")
            if kind == "eof":
                raise WorkerError(f"the worker closed its output{self._spoils()}")
            if message.get("id") != request_id:
                continue
            if kind in ("status", "warning"):
                if on_progress is not None:
                    on_progress(message)
                continue
            if kind == "error":
                raise WorkerError(str(message.get("message") or "worker error"))
            return message

    # ── readers ────────────────────────────────────────────────────────
    def _read_stdout(self, proc: subprocess.Popen) -> None:
        stream = proc.stdout
        if stream is None:
            return
        for line in stream:
            text = line.strip()
            if not text:
                continue
            try:
                message = json.loads(text)
            except ValueError:
                # Library noise on fd 1 is a bug in the worker, not a fatal one:
                # keep it as diagnostic context and carry on.
                self._tail.append(text[:300])
                continue
            if isinstance(message, dict):
                self._inbox.put(message)
        self._inbox.put({"type": "eof"})

    def _read_stderr(self, proc: subprocess.Popen) -> None:
        stream = proc.stderr
        if stream is None:
            return
        for line in stream:
            text = line.strip()
            if text:
                self._tail.append(text[:300])

    def _spoils(self) -> str:
        tail = " · ".join(list(self._tail)[-3:])
        return f" · {tail}" if tail else ""
