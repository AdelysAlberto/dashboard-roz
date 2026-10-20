"""Interactive `pi --mode rpc` sessions: JSONL over stdin/stdout.

The dashboard can send follow-up prompts and answer pi's dialog requests
(select / confirm / input) coming from extensions such as ask_user_question.
"""

from __future__ import annotations

import asyncio
import json
import os
import shlex
import time
from pathlib import Path

from server.pilot_agents import agents_dir, available_agents, persona_path
from server.pilot_events import compact_event

CONFIG = {
    "pi_bin": os.environ.get("PI_BIN", "pi"),
    "model": os.environ.get("PI_MODEL", ""),
    "flags": os.environ.get("PI_FLAGS", ""),
    "project_dir": os.environ.get("ROZ_PROJECT_DIR", os.getcwd()),
    "timeout": int(os.environ.get("PI_TIMEOUT", "600")),
    # idle kill for abandoned sessions (seconds)
    "idle_ttl": int(os.environ.get("PI_IDLE_TTL", "1800")),
}


class AnalysisRun:
    """One long-lived pi RPC subprocess. Buffers events for reconnects."""

    def __init__(self, run_id: str, first_prompt: str, agent: str | None, doc_path: str):
        self.run_id = run_id
        self.doc_path = doc_path
        self.agent = agent
        self.events: list[dict] = []
        self.exited = False
        self.exit_code: int | None = None
        self.idle = False          # True once agent_settled after a prompt
        self.last_activity = time.time()
        self.proc: asyncio.subprocess.Process | None = None
        self._task: asyncio.Task | None = None
        self._cond = asyncio.Condition()
        self._stdin_lock = asyncio.Lock()

        self.persona = persona_path(agent)
        argv = [CONFIG["pi_bin"], "--mode", "rpc"]
        if CONFIG["model"]:
            argv += ["--model", CONFIG["model"]]
        argv += [os.path.expanduser(f) for f in shlex.split(CONFIG["flags"])]
        # Last system prompt wins the "closest instruction" position: the persona
        # must come after the global AGENTS.md appended by PI_FLAGS.
        if self.persona:
            argv += ["--append-system-prompt", str(self.persona)]
        self.argv = argv
        self._first_prompt = first_prompt

    # ── lifecycle ──

    async def start(self):
        self._task = asyncio.create_task(self._run())

    async def _run(self):
        if self.agent and self.agent != "none" and not self.persona:
            await self._emit({
                "type": "roz_stderr",
                "message": (
                    f"agent '{self.agent}' has no persona file "
                    f"(PI_AGENTS_DIR={agents_dir() or 'unset'}); "
                    "running with the default prompt"
                ),
            })
        cwd = Path(CONFIG["project_dir"]).expanduser().resolve()
        try:
            self.proc = await asyncio.create_subprocess_exec(
                *self.argv,
                cwd=str(cwd),
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env={**os.environ},
                limit=32 * 1024 * 1024,  # pi emits huge single JSONL lines
            )
        except FileNotFoundError as e:
            await self._emit({"type": "roz_error", "message": f"pi binary not found: {e}"})
            return await self._shutdown("error")
        except Exception as e:  # noqa: BLE001
            await self._emit({"type": "roz_error", "message": str(e)})
            return await self._shutdown("error")

        try:
            await self._send({"type": "prompt", "message": self._first_prompt})
            await self._pump()
            code = await self.proc.wait()
            return await self._shutdown("exit", code)
        except asyncio.CancelledError:
            self._kill()
            return await self._shutdown("cancelled")

    async def _pump(self):
        assert self.proc and self.proc.stdout
        while True:
            try:
                line = await asyncio.wait_for(
                    self.proc.stdout.readline(), timeout=max(CONFIG["timeout"], 3600))
            except (asyncio.LimitOverrunError, ValueError) as e:
                await self._emit({"type": "roz_error", "message": f"stdout line too long: {e}"})
                continue
            except asyncio.TimeoutError:
                # no output for a long stretch (idle dialog/wait): requeue the read
                continue
            if not line:
                break
            text = line.decode("utf-8", "replace").strip()
            if not text:
                continue
            try:
                ev = json.loads(text)
            except json.JSONDecodeError:
                await self._emit({"type": "roz_stderr", "message": text})
                continue
            # track idle/working state
            if ev.get("type") == "agent_settled":
                self.idle = True
            elif ev.get("type") in ("agent_start", "turn_start"):
                self.idle = False
            self.last_activity = time.time()
            await self._emit(compact_event(ev))

    async def _shutdown(self, status: str, code: int | None = None):
        self.exited = True
        self.exit_code = code
        await self._emit({"type": "roz_end", "status": status, "exit_code": code})
        async with self._cond:
            self._cond.notify_all()
        return status

    def _kill(self):
        if self.proc and self.proc.returncode is None:
            self.proc.kill()

    # ── outbound commands ──

    async def _send(self, cmd: dict):
        if self.proc is None or self.proc.returncode is not None:
            raise RuntimeError("session not running")
        async with self._stdin_lock:
            data = (json.dumps(cmd, ensure_ascii=False) + "\n").encode("utf-8")
            self.proc.stdin.write(data)
            await self.proc.stdin.drain()
        self.last_activity = time.time()

    async def prompt(self, message: str):
        await self._send({"type": "prompt", "message": message})
        self.idle = False

    async def answer_ui(self, request_id: str, payload: dict):
        """Reply to an extension_ui_request (select/confirm/input)."""
        await self._send({"type": "extension_ui_response", "id": request_id, **payload})

    async def close(self):
        if self.proc and self.proc.returncode is None and self.proc.stdin:
            self.proc.stdin.close()
        self._kill()

    # ── inbound subscription ──

    async def subscribe(self, from_index: int = 0):
        idx = from_index
        while True:
            async with self._cond:
                while idx >= len(self.events) and not self.exited:
                    await self._cond.wait()
                batch = self.events[idx:]
                idx = len(self.events)
                finished = self.exited and idx >= len(self.events)
            for ev in batch:
                yield ev
            if finished:
                return

    async def _emit(self, ev: dict):
        async with self._cond:
            self.events.append(ev)
            self._cond.notify_all()


class RunRegistry:
    def __init__(self):
        self.runs: dict[str, AnalysisRun] = {}
        self._sweeper: asyncio.Task | None = None

    async def create(self, prompt: str, agent: str | None, doc_path: str) -> AnalysisRun:
        self._ensure_sweeper()
        run = AnalysisRun(f"run-{len(self.runs) + 1:04d}", prompt, agent, doc_path)
        self.runs[run.run_id] = run
        await run.start()
        return run

    def get(self, run_id: str) -> AnalysisRun | None:
        return self.runs.get(run_id)

    def _ensure_sweeper(self):
        if self._sweeper is None or self._sweeper.done():
            self._sweeper = asyncio.create_task(self._sweep())

    async def _sweep(self):
        while True:
            await asyncio.sleep(60)
            now = time.time()
            for run in list(self.runs.values()):
                if not run.exited and now - run.last_activity > CONFIG["idle_ttl"]:
                    await run.close()




registry = RunRegistry()
