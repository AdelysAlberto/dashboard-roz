"""Pi agent provider for monitoring pi sessions and background subagents."""

from __future__ import annotations

import calendar
import glob
import json
import os
import re
import signal
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

from server.providers.base import BaseAgentProvider, InterruptOutcome
from server import pilot, session_cache

LEGACY_SESSIONS_DIR = "~/.pi/agent/sessions"

# pi exposes no external abort for a TUI-owned turn: RPC is stdin/stdout of a
# child process, not a socket. `turn` is therefore advertised only for sessions
# this process owns through `pilot.py` (see `_interrupt_levels`).
PI_INTERRUPT_LEVELS: tuple[str, ...] = ("tool", "kill")
PI_OWNED_INTERRUPT_LEVELS: tuple[str, ...] = ("tool", "turn", "kill")

# A bash tool child is either a shell wrapper (`bash -c "cd x && grep"`) or, when
# bash execs a single simple command, the command itself (`sleep 600`). MCP
# servers are children of pi too and are also process-group leaders, so neither
# pgid nor ppid can tell them apart: the in-flight command from the transcript
# plus the shell prefix do.
_SHELL_TOOL_RE = re.compile(r"(^|/)(ba|z|da|k)?sh\s+-[A-Za-z]*c\b")
_KILL_GRACE_SECONDS = 2.0

STALL_SECONDS = 180
QUIET_SECONDS = 15
PRIMARY_LIVE_MTIME = 12 * 3600
_PRIMARY_MAX_BYTES = 2_000_000
_TAG_RE = re.compile(r"\b(TASK(?:[-_][A-Z0-9]+)+|P(?:LAN)?[-_]T\d+\b|T\d+\b)\b", re.I)


def _safe_project_dir(cwd: str) -> str:
    return "--" + re.sub(r"[/\\:]", "-", re.sub(r"^[/\\]", "", os.path.abspath(cwd))) + "--"


def _ps_rows() -> list[dict]:
    try:
        out = subprocess.run(
            ["ps", "-axo", "pid=,ppid=,etime=,comm="],
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout
    except Exception:  # noqa: BLE001
        return []
    rows = []
    for line in out.splitlines():
        parts = line.split(None, 3)
        if len(parts) < 4:
            continue
        pid, ppid, etime, comm = parts
        if not comm.endswith("pi"):
            continue
        rows.append({"pid": int(pid), "ppid": int(ppid), "start": time.time() - _etime_s(etime)})
    return rows


def _etime_s(etime: str) -> float:
    m = re.match(r"(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$", etime)
    if not m:
        return 0.0
    d, h, mi, s = (int(x) if x else 0 for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + s


def _live_subagent_pids() -> dict[float, int]:
    rows = _ps_rows()
    pi_pids = {r["pid"] for r in rows}
    return {r["start"]: r["pid"] for r in rows if r["ppid"] in pi_pids}


def _live_primary_pids() -> dict[float, int]:
    rows = _ps_rows()
    pi_pids = {r["pid"] for r in rows}
    return {r["start"]: r["pid"] for r in rows if r["ppid"] not in pi_pids}


def _file_created(path: Path) -> float:
    m = re.match(r"(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-(\d{3})Z_", path.name)
    if m:
        return calendar.timegm(time.strptime(m.group(1), "%Y-%m-%dT%H-%M-%S")) + int(m.group(2)) / 1000
    return path.stat().st_ctime


def _match_pid(path: Path, pids: dict[float, int]) -> int | None:
    ts = _file_created(path)
    best, best_delta = None, 10.0
    for start, pid in pids.items():
        delta = abs(start - ts)
        if delta < best_delta:
            best, best_delta = pid, delta
    return best


def _local_hhmmss(ts_s: float) -> str:
    """Local clock for the dashboard log. The UI reads times in operator timezone."""
    return time.strftime("%H:%M:%S", time.localtime(ts_s))


def _child_processes(pid: int) -> list[dict]:
    """Live (non-zombie) direct children of `pid` with their process group."""
    try:
        out = subprocess.run(
            ["ps", "-axo", "pid=,ppid=,pgid=,stat=,command="],
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout
    except Exception:  # noqa: BLE001
        return []
    rows: list[dict] = []
    for line in out.splitlines():
        parts = line.split(None, 4)
        if len(parts) < 5:
            continue
        cpid, ppid, pgid, stat, cmd = parts
        if int(ppid) != pid or "Z" in stat:
            continue
        rows.append({"pid": int(cpid), "pgid": int(pgid), "cmd": cmd})
    return rows


def _tool_processes(session_pid: int, command: str = "") -> list[dict]:
    """Children of the agent that are the running tool.

    Shell wrappers always qualify. Any other child qualifies only when its
    command line matches the tool command read back from the transcript, which
    is the case bash leaves behind after exec'ing a single simple command.
    """
    want = " ".join(command.split())
    out: list[dict] = []
    for child in _child_processes(session_pid):
        if _SHELL_TOOL_RE.search(child["cmd"]):
            out.append(child)
            continue
        got = " ".join(child["cmd"].split())
        if want and got and (want.startswith(got) or got.startswith(want[:120])):
            out.append(child)
    return out


def _last_bash_command(path: Path) -> str:
    """Command of the most recent bash tool call in the transcript."""
    command = ""
    for entry in _iter_entries(path):
        message = entry.get("message") or {}
        if message.get("role") != "assistant":
            continue
        for block in message.get("content") or []:
            if not isinstance(block, dict) or block.get("type") != "toolCall":
                continue
            if block.get("name") == "bash":
                command = str((block.get("arguments") or {}).get("command") or "")
    return command


def _kill_group(pgid: int, grace: float = _KILL_GRACE_SECONDS) -> str:
    """SIGTERM one process group, escalate to SIGKILL after `grace`."""
    if pgid <= 1 or pgid == os.getpgid(0):
        return f"refused: pgid {pgid} is not a tool group"
    try:
        os.killpg(pgid, signal.SIGTERM)
    except ProcessLookupError:
        return "already gone"
    except PermissionError:
        return "permission denied"
    deadline = time.time() + grace
    while time.time() < deadline:
        try:
            os.killpg(pgid, 0)
        except ProcessLookupError:
            return "terminated"
        time.sleep(0.1)
    try:
        os.killpg(pgid, signal.SIGKILL)
    except ProcessLookupError:
        return "terminated"
    except PermissionError:
        return "permission denied on SIGKILL"
    return "killed"


def _resolve_pid(target: Path) -> tuple[int | None, Path | None]:
    """Live agent pid for a session file, or the async run dir that holds it."""
    for adir in _async_runs_dirs():
        if adir.resolve() in target.parents or target.parent == adir.resolve():
            return None, target if target.is_dir() else target.parent
    if not _under_session_roots(target):
        raise ValueError(f"Path outside Pi sessions dir: {target}")
    return _match_pid(target, _live_subagent_pids()) or _match_pid(target, _live_primary_pids()), None


def _iter_entries(path: Path):
    with path.open(encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def _text_of(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text")
    return ""


def _tool_result_preview(content: Any) -> str:
    txt = _text_of(content)
    return (txt[:160] + "…") if len(txt) > 160 else txt


def _tag_of(task: str) -> str:
    m = _TAG_RE.search(task)
    return m.group(1).upper() if m else ""


def _lookup_agent(task: str, name_map: list[dict]) -> str | None:
    if not task:
        return None
    key = re.sub(r"\s+", " ", re.sub(r"^Task:\s*", "", task.strip())).split("\n")[0][:60]
    for entry in reversed(name_map):
        t = re.sub(r"\s+", " ", entry["task"].split("\n")[0])[:60]
        if t and key.startswith(t[:min(len(key), len(t))]):
            return entry["agent"]
    return None


def _settings_session_dir() -> str | None:
    p = Path(os.path.expanduser("~/.pi/agent/settings.json"))
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
        sd = d.get("sessionDir")
        return str(Path(sd).expanduser()) if isinstance(sd, str) and sd else None
    except Exception:  # noqa: BLE001
        return None


def _extra_parent_dirs() -> list[Path]:
    sd = _settings_session_dir()
    return [Path(sd)] if sd else []


def _session_roots() -> list[Path]:
    """Resolve session roots at call time (no module-level caching).

    Priority: PI_SESSIONS_DIR env (":" or "," separated) -> sessionDir in
    ~/.pi/agent/settings.json -> legacy ~/.pi/agent/sessions. The legacy root is
    always appended so historical sessions stay visible.
    """
    raw = os.environ.get("PI_SESSIONS_DIR", "").strip()
    candidates: list[str] = []
    if raw:
        candidates = [c.strip() for c in re.split(r"[:,]", raw) if c.strip()]
    else:
        sd = _settings_session_dir()
        if sd:
            candidates = [sd]
    candidates.append(LEGACY_SESSIONS_DIR)
    roots: list[Path] = []
    seen: set[str] = set()
    for c in candidates:
        p = Path(c).expanduser()
        key = str(p)
        if key not in seen and p.is_dir():
            seen.add(key)
            roots.append(p)
    return roots


def _idle_ttl() -> int:
    """Abandoned-session boundary, resolved at call time (same knob as pilot.py).

    PI_IDLE_TTL: idle seconds after which a session is considered abandoned and
    reported as `ended` (dual use: idle kill in pilot + monitor classification).
    """
    try:
        return int(os.environ.get("PI_IDLE_TTL", "1800"))
    except (TypeError, ValueError):
        return 1800


def _under_session_roots(fp: Path) -> bool:
    """Path guard for tail_log/kill_session: any configured root, jsonl only."""
    return fp.suffix == ".jsonl" and any(r.resolve() in fp.parents for r in _session_roots())


def _newest(files: list[Path], limit: int) -> list[Path]:
    return sorted(files, key=lambda p: p.stat().st_mtime, reverse=True)[:limit]


def _stale_oversized(path: Path) -> bool:
    """Skip an oversized primary only when stale; a live >2MB session must stay visible."""
    stat = path.stat()
    return stat.st_size > _PRIMARY_MAX_BYTES and time.time() - stat.st_mtime > STALL_SECONDS


def _async_reported_session_files() -> set[str]:
    """Resolved sessionFile paths already reported by list_async_subagents (avoid double cards)."""
    files: set[str] = set()
    for adir in _async_runs_dirs():
        for rdir in (p for p in adir.iterdir() if p.is_dir()):
            status_file = rdir / "status.json"
            if not status_file.exists():
                continue
            try:
                data = json.loads(status_file.read_text("utf-8"))
            except Exception:  # noqa: BLE001
                continue
            sfile = data.get("sessionFile")
            if isinstance(sfile, str) and sfile:
                files.add(str(Path(sfile).expanduser().resolve()))
    return files


def _project_label(safe_dir: str) -> str:
    name = safe_dir.strip("-")
    return name.rsplit("-", 1)[-1] if "-" in name else name


def _calls_in_file(path: Path) -> dict:
    """Subagent calls announced in one parent transcript."""
    calls: list[dict] = []
    for entry in _iter_entries(path):
        message = entry.get("message") or {}
        if message.get("role") != "assistant":
            continue
        for block in message.get("content") or []:
            if not isinstance(block, dict):
                continue
            if block.get("type") != "toolCall" or block.get("name") != "subagent":
                continue
            args = block.get("arguments") or {}
            if args.get("task"):
                calls.append({"agent": str(args.get("agent", "?")), "task": str(args["task"])})
    return {"calls": calls}


def _extract_subagent_calls(dirs: list[Path], limit_files: int) -> list[dict]:
    files: list[Path] = []
    for d in dirs:
        if d.is_dir():
            files.extend(sorted(d.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)[:limit_files])
    entries: list[dict] = []
    for f in files:
        entries.extend(session_cache.get_or_build(f, _calls_in_file, namespace="calls")["calls"])
    return entries


def _load_name_map(project_cwd: str, limit_files: int = 8) -> list[dict]:
    roots = _session_roots()
    return _extract_subagent_calls([r / _safe_project_dir(project_cwd) for r in roots] + roots, limit_files)


def _load_name_map_from_dir(project_dir: Path, limit_files: int = 8) -> list[dict]:
    return _extract_subagent_calls([project_dir] + _extra_parent_dirs(), limit_files)


def _async_runs_dirs() -> list[Path]:
    candidates: list[Path] = []
    tmp = tempfile.gettempdir()
    for pattern in (f"{tmp}/pi-subagents-uid-*/async-subagent-runs", "/tmp/pi-subagents-uid-*/async-subagent-runs"):
        for p in glob.glob(pattern):
            path = Path(p)
            if path.is_dir() and path not in candidates:
                candidates.append(path)
    return candidates


def _interrupt_levels(path: Path) -> tuple[str, ...]:
    """Rungs this session can actually reach right now."""
    owned = pilot.registry.run_for_session(str(path)) is not None
    return PI_OWNED_INTERRUPT_LEVELS if owned else PI_INTERRUPT_LEVELS


def _read_facts(path: Path) -> dict:
    """Everything that depends only on the file contents.

    Cached by `session_cache` against (mtime, size); nothing here may depend on
    the process table or on a name map, or the cache would serve stale data.
    """
    header: dict = {}
    task = ""
    last_ts = 0.0
    last_activity = ""
    msgs = 0
    tokens = 0
    cost = 0.0
    model_id = ""
    model_provider = ""
    tail_role = ""
    tail_tool = False
    for d in _iter_entries(path):
        if d.get("type") == "session":
            header = d
            continue
        m = d.get("message")
        if d.get("type") == "model_change" and d.get("modelId"):
            model_id = str(d["modelId"])
            model_provider = str(d.get("provider") or "")
        if not m:
            continue
        if d.get("type") == "message":
            # Tail marker: custom/context_edit entries must not update this.
            tail_role = str(m.get("role") or "")
            tail_tool = tail_role == "assistant" and any(
                isinstance(c, dict) and c.get("type") == "toolCall" for c in (m.get("content") or [])
            )
        msgs += 1
        try:
            ts = int(m.get("timestamp") or 0) / 1000
            last_ts = max(last_ts, ts)
        except (TypeError, ValueError):
            pass
        role = m.get("role")
        if role == "user" and not task:
            task = _text_of(m.get("content"))
        if role == "assistant":
            if m.get("model"):
                model_id = str(m["model"])
                model_provider = str(m.get("provider") or "")
            for c in m.get("content") or []:
                if not isinstance(c, dict):
                    continue
                if c.get("type") == "toolCall":
                    args = c.get("arguments") or {}
                    hint = (
                        args.get("command") or args.get("path") or args.get("pattern")
                        or args.get("query") or args.get("url") or _tool_result_preview(json.dumps(args, ensure_ascii=False)[:100])
                    )
                    last_activity = f"{c.get('name')} {hint}"[:160]
                elif c.get("type") == "text" and c.get("text"):
                    last_activity = f"escribiendo: {c['text'].strip()[:80]}"
                elif c.get("type") == "thinking" and c.get("thinking"):
                    last_activity = f"pensando: {c['thinking'].strip()[:80]}"
            u = m.get("usage") or {}
            tokens += int(u.get("totalTokens") or (u.get("input", 0) + u.get("output", 0)))
            try:
                cost += float((u.get("cost") or {}).get("total") or 0)
            except (TypeError, ValueError):
                pass

    return {
        "header": header,
        "task": task,
        "last_ts": last_ts,
        "last_activity": last_activity,
        "msgs": msgs,
        "tokens": tokens,
        "cost": cost,
        "model_id": model_id,
        "model_provider": model_provider,
        "tail_role": tail_role,
        "tail_tool": tail_tool,
    }


def _summarize_session(path: Path, pid: int | None, name_map: list[dict], *, kind: str = "subagent") -> dict:
    facts = session_cache.get_or_build(path, _read_facts)
    header = facts["header"]
    task = facts["task"]
    last_ts = facts["last_ts"]
    last_activity = facts["last_activity"]
    msgs = facts["msgs"]
    tokens = facts["tokens"]
    cost = facts["cost"]
    model_id = facts["model_id"]
    model_provider = facts["model_provider"]
    tail_role = facts["tail_role"]
    tail_tool = facts["tail_tool"]

    agent = _lookup_agent(task, name_map)
    now = time.time()
    mtime = path.stat().st_mtime
    idle = now - max(mtime, last_ts) if (mtime or last_ts) else 0
    live = pid is not None or (
        kind == "primary" and idle <= STALL_SECONDS and now - mtime <= PRIMARY_LIVE_MTIME
    )
    # The agent holds the turn only while a tool call is pending or a prompt was
    # just submitted; a settled tail (assistant text/thinking) means it is done.
    in_flight = tail_role in ("toolResult", "user") or (tail_role == "assistant" and tail_tool)
    if not live or idle > _idle_ttl():
        # Terminal: process gone or abandoned past PI_IDLE_TTL (never red forever).
        state = "ended"
    elif in_flight and idle > STALL_SECONDS:
        # Red ONLY while the agent holds the turn and is silent.
        state = "stalled"
    elif idle > QUIET_SECONDS:
        state = "quiet"
    else:
        state = "active"

    cwd_val = header.get("cwd", "")
    project_val = os.path.basename(os.path.abspath(cwd_val).rstrip("/")) if cwd_val else ""

    return {
        "provider": "pi",
        "path": str(path),
        "kind": kind,
        "id": header.get("id", path.stem),
        "cwd": cwd_val,
        "project": project_val,
        "agent": agent or ("sesión" if kind == "primary" else "—"),
        "model": model_id,
        "model_provider": model_provider,
        "task": task.strip()[:200],
        "task_tag": _tag_of(task),
        "state": state,
        "idle_seconds": int(idle),
        "started": header.get("timestamp", ""),
        "updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(mtime)),
        "messages": msgs,
        "tokens": tokens,
        "cost": round(cost, 4),
        "pid": pid,
        "last_activity": last_activity or "(sin actividad registrada)",
        "size": path.stat().st_size,
        "interrupt_levels": list(_interrupt_levels(path)),
    }


class PiAgentProvider(BaseAgentProvider):
    """Provider for discovering, reading logs and controlling Pi agents."""

    name = "pi"
    interrupt_levels = PI_INTERRUPT_LEVELS

    def list_async_subagents(self) -> list[dict]:
        out: list[dict] = []
        for adir in _async_runs_dirs():
            if not adir.is_dir():
                continue
            for rdir in sorted(adir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
                if not rdir.is_dir() or rdir.name.startswith("."):
                    continue
                status_file = rdir / "status.json"
                events_file = rdir / "events.jsonl"
                if not status_file.exists():
                    continue
                try:
                    status = json.loads(status_file.read_text("utf-8"))
                except Exception:
                    continue

                pid = status.get("pid")
                is_alive = False
                if pid:
                    try:
                        os.kill(pid, 0)
                        is_alive = True
                    except (OSError, ProcessLookupError):
                        is_alive = False

                started_ms = status.get("startedAt") or 0
                last_ms = status.get("lastActivityAt") or status.get("lastUpdate") or started_ms
                now = time.time()
                idle = max(0, int(now - (last_ms / 1000.0))) if last_ms else 0

                if not is_alive:
                    state = "ended"
                elif idle > STALL_SECONDS:
                    state = "stalled"
                elif idle > QUIET_SECONDS:
                    state = "quiet"
                else:
                    state = "active"

                steps = status.get("steps") or []
                s0 = steps[0] if steps else {}
                agent = s0.get("agent") or status.get("agent") or "subagent"
                model_id = str(status.get("modelId") or status.get("model") or s0.get("modelId") or s0.get("model") or "")
                model_provider = str(status.get("provider") or s0.get("provider") or "")

                task = ""
                if events_file.exists():
                    try:
                        with events_file.open("r", encoding="utf-8", errors="replace") as ef:
                            for line in ef:
                                line = line.strip()
                                if not line:
                                    continue
                                ev = json.loads(line)
                                if ev.get("type") == "message_end":
                                    m = ev.get("message", {})
                                    if m.get("role") == "user":
                                        content = m.get("content")
                                        if isinstance(content, list):
                                            task = "\n".join(
                                                c.get("text", "")
                                                for c in content
                                                if isinstance(c, dict) and c.get("type") == "text"
                                            )
                                        elif isinstance(content, str):
                                            task = content
                                        if task:
                                            break
                    except Exception:
                        pass
                if not task:
                    task = str(s0.get("description") or "")

                cwd = status.get("cwd", "")
                tokens_dict = status.get("totalTokens") or s0.get("tokens") or {}
                tokens = int(
                    tokens_dict.get("total") or (tokens_dict.get("input", 0) + tokens_dict.get("output", 0))
                )
                msgs = int(status.get("turnCount") or s0.get("turnCount") or status.get("toolCount") or 0)

                last_activity = ""
                cur_tool = s0.get("currentTool") or status.get("currentTool")
                cur_args = s0.get("currentToolArgs") or status.get("currentToolArgs") or ""
                if cur_tool:
                    last_activity = f"{cur_tool} {cur_args}"[:160]
                elif s0.get("recentOutput"):
                    last_activity = str(s0["recentOutput"][-1])[:160]

                target_path = str(events_file if events_file.exists() else status_file)
                out.append(
                    {
                        "provider": "pi",
                        "path": target_path,
                        "kind": "subagent",
                        "id": status.get("runId", rdir.name),
                        "cwd": cwd,
                        "project": os.path.basename(os.path.abspath(cwd).rstrip("/")) if cwd else "unknown",
                        "agent": agent,
                        "model": model_id,
                        "model_provider": model_provider,
                        "task": task.strip()[:200],
                        "task_tag": _tag_of(task),
                        "state": state,
                        "idle_seconds": idle,
                        "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(started_ms / 1000.0))
                        if started_ms
                        else "",
                        "updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(last_ms / 1000.0))
                        if last_ms
                        else "",
                        "messages": msgs,
                        "tokens": tokens,
                        "cost": 0.0,
                        "pid": pid if is_alive else None,
                        "last_activity": last_activity or ("(activo)" if is_alive else "(finalizado)"),
                        "size": events_file.stat().st_size if events_file.exists() else 0,
                        "interrupt_levels": list(PI_INTERRUPT_LEVELS),
                    }
                )
        return out

    def list_sessions(self, project_cwds: list[str]) -> list[dict[str, Any]]:
        out: list[dict] = []
        seen_ids: set[str] = set()

        # 1. First add modern async runs from pi-subagents
        for s in self.list_async_subagents():
            seen_ids.add(s["id"])
            out.append(s)

        # 2. Filesystem sessions across every configured root
        sub_pids = _live_subagent_pids()
        prim_pids = _live_primary_pids()
        async_files = _async_reported_session_files()
        wanted = {_safe_project_dir(c): c for c in project_cwds}
        name_maps: dict[Path, list[dict]] = {}

        def add(s: dict) -> None:
            if s["id"] not in seen_ids:
                seen_ids.add(s["id"])
                out.append(s)

        for root in _session_roots():
            # (a) flat root-level *.jsonl = primary sessions (custom sessionDir layout)
            for f in _newest(list(root.glob("*.jsonl")), 20):
                if _stale_oversized(f):
                    continue
                add(_summarize_session(f, _match_pid(f, prim_pids), [], kind="primary"))
            # (c) <root>/<parentBase>/<childId>/run-N/session.jsonl = subagent child sessions
            for base in sorted(p for p in root.iterdir() if p.is_dir()):
                if base.name.startswith(("--", ".")) or base.name == "subagent-artifacts":
                    continue
                for child in (p for p in base.iterdir() if p.is_dir()):
                    for run in (p for p in child.iterdir() if p.is_dir() and p.name.startswith("run-")):
                        f = run / "session.jsonl"
                        if not f.is_file() or str(f.resolve()) in async_files:
                            continue
                        add(_summarize_session(f, _match_pid(f, sub_pids), [], kind="subagent"))
            # (b) legacy --cwd-- project dirs (primaries + subagents/*.jsonl)
            session_dirs: dict[Path, str] = {}
            for d in sorted(root.iterdir()):
                if d.is_dir() and d.name.startswith("--") and d.name.endswith("--"):
                    session_dirs[d] = wanted.get(d.name, "")
            for d, cwd in session_dirs.items():
                if d not in name_maps:
                    name_maps[d] = _load_name_map(cwd) if cwd else _load_name_map_from_dir(d)
                subdir = d / "subagents"
                if subdir.is_dir():
                    for f in _newest(list(subdir.glob("*.jsonl")), 50):
                        add(_summarize_session(f, _match_pid(f, sub_pids), name_maps[d]))
                for f in _newest(list(d.glob("*.jsonl")), 20):
                    if _stale_oversized(f):
                        continue
                    s = _summarize_session(f, _match_pid(f, prim_pids), [], kind="primary")
                    if cwd:
                        s["project"] = os.path.basename(os.path.abspath(cwd).rstrip("/")) or cwd
                    else:
                        s["project"] = _project_label(d.name)
                    add(s)
        return out

    def tail_log(self, target: str, lines: int = 120) -> list[dict[str, Any]]:
        fp = Path(target).expanduser().resolve()

        # Check if this is an async run event file
        is_async_file = False
        for adir in _async_runs_dirs():
            if adir.resolve() in fp.parents:
                is_async_file = True
                break

        if not is_async_file and not _under_session_roots(fp):
            raise ValueError(f"Path outside Pi sessions dir: {target}")

        if not fp.exists():
            return []

        raw = fp.read_text(encoding="utf-8", errors="replace").splitlines()[-(lines * 2 + 20) :]
        out: list[dict] = []
        for line in raw:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except (json.JSONDecodeError, ValueError):
                continue

            # Handle async events.jsonl
            ev_type = d.get("type")
            if ev_type in ("message_end", "tool_execution_start", "tool_execution_end", "turn_start", "agent_start"):
                ts_val = d.get("observedAt") or d.get("ts")
                item = {"ts": _local_hhmmss(ts_val / 1000.0) if ts_val else ""}
                if ev_type == "message_end":
                    m = d.get("message") or {}
                    role = m.get("role")
                    if role == "assistant":
                        for c in m.get("content") or []:
                            if not isinstance(c, dict):
                                continue
                            ct = c.get("type")
                            if ct == "thinking":
                                out.append({**item, "kind": "thinking", "text": (c.get("thinking") or "")[:400]})
                            elif ct == "text":
                                out.append({**item, "kind": "text", "text": (c.get("text") or "")[:800]})
                            elif ct == "toolCall":
                                args = c.get("arguments") or {}
                                brief = (
                                    args.get("command")
                                    or args.get("path")
                                    or args.get("pattern")
                                    or args.get("query")
                                    or args.get("url")
                                    or args.get("agent")
                                    or json.dumps(args, ensure_ascii=False)[:200]
                                )
                                out.append({**item, "kind": "tool", "tool": c.get("name", "?"), "text": str(brief)[:400]})
                    elif role == "user":
                        content = m.get("content")
                        txt = (
                            "\n".join(
                                c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"
                            )
                            if isinstance(content, list)
                            else str(content)
                        )
                        out.append({**item, "kind": "user", "text": txt[:300]})
                elif ev_type == "tool_execution_start":
                    args = d.get("args") or {}
                    brief = (
                        args.get("command")
                        or args.get("path")
                        or args.get("pattern")
                        or args.get("query")
                        or json.dumps(args, ensure_ascii=False)[:200]
                    )
                    out.append({**item, "kind": "tool", "tool": d.get("toolName", "?"), "text": str(brief)[:400]})
                elif ev_type == "tool_execution_end":
                    res = d.get("result") or ""
                    res_str = str(res)[:160] + ("…" if len(str(res)) > 160 else "")
                    out.append({**item, "kind": "result", "tool": d.get("toolName", ""), "text": res_str})
                continue

            # Handle legacy pi session jsonl
            m = d.get("message")
            if not m:
                continue
            role = m.get("role")
            ts = m.get("timestamp")
            item = {"ts": _local_hhmmss(ts / 1000.0) if ts else ""}
            if role == "assistant":
                for c in m.get("content") or []:
                    if not isinstance(c, dict):
                        continue
                    t = c.get("type")
                    if t == "thinking":
                        out.append({**item, "kind": "thinking", "text": (c.get("thinking") or "")[:400]})
                    elif t == "text":
                        out.append({**item, "kind": "text", "text": (c.get("text") or "")[:800]})
                    elif t == "toolCall":
                        args = c.get("arguments") or {}
                        brief = (
                            args.get("command")
                            or args.get("path")
                            or args.get("pattern")
                            or args.get("query")
                            or args.get("url")
                            or args.get("agent")
                            or json.dumps(args, ensure_ascii=False)[:200]
                        )
                        out.append({**item, "kind": "tool", "tool": c.get("name", "?"), "text": str(brief)[:400]})
            elif role == "toolResult":
                prev = _tool_result_preview(m.get("content"))
                out.append({**item, "kind": "result", "tool": m.get("toolName", ""), "text": prev})
            elif role == "user":
                txt = _text_of(m.get("content"))
                out.append({**item, "kind": "user", "text": txt[:300]})
        return out[-lines:]

    def kill_session(self, target: str) -> int:
        outcome = self.interrupt(target, "kill")
        if not outcome.ok:
            raise RuntimeError(outcome.detail)
        return outcome.pids[0] if outcome.pids else 0

    def interrupt(self, target: str, level: str = "tool") -> InterruptOutcome:
        if level not in PI_OWNED_INTERRUPT_LEVELS:
            return InterruptOutcome(False, self.name, level, f"unknown level '{level}'")
        fp = Path(target).expanduser().resolve()

        if level == "turn":
            run = pilot.registry.run_for_session(str(fp))
            if run is None:
                return InterruptOutcome(
                    False, self.name, level,
                    "this transcript is not driven by roz: pi has no external "
                    "turn abort, use 'tool' or 'kill'",
                )
            try:
                run.abort_turn_blocking()
            except (RuntimeError, TimeoutError) as e:
                return InterruptOutcome(False, self.name, level, f"abort failed: {e}")
            pid = run.proc.pid if run.proc and run.proc.pid else None
            return InterruptOutcome(
                True, self.name, level,
                f"abort sent to run {run.run_id} (session stays resumable)",
                (pid,) if pid else (),
                (run.run_id,),
            )

        try:
            pid, run_dir = _resolve_pid(fp)
        except ValueError as e:
            return InterruptOutcome(False, self.name, level, str(e))

        if run_dir is not None:
            status_file = run_dir / "status.json"
            try:
                pid = int(json.loads(status_file.read_text("utf-8")).get("pid") or 0) or None
            except FileNotFoundError:
                return InterruptOutcome(False, self.name, level, "no live async process found")
            except (OSError, ValueError, json.JSONDecodeError) as e:
                return InterruptOutcome(False, self.name, level, f"failed to read async status: {e}")
            if not pid:
                return InterruptOutcome(False, self.name, level, "async status has no pid")

        if pid is None:
            return InterruptOutcome(
                False, self.name, level,
                "no live process correlated with this session",
            )

        if level == "tool":
            procs = _tool_processes(pid, _last_bash_command(fp) if run_dir is None else "")
            if not procs:
                return InterruptOutcome(
                    False, self.name, level,
                    f"PID {pid} has no tool process in flight (read/edit/model waits "
                    "are not cuttable; use 'kill')",
                )
            results = {p["pid"]: _kill_group(p["pgid"]) for p in procs}
            cut = tuple(p for p in results if results[p] in ("terminated", "killed"))
            detail = "; ".join(
                f"pgid {p['pgid']} ({p['cmd'].split()[0] if p['cmd'].split() else '?'}) "
                f"{results[p['pid']]}"
                for p in procs
            )
            return InterruptOutcome(bool(cut), self.name, level, detail, cut, tuple(
                f"pgid:{p['pgid']}" for p in procs
            ))

        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            return InterruptOutcome(False, self.name, level, f"PID {pid} already gone")
        except PermissionError:
            return InterruptOutcome(False, self.name, level, f"no permission to signal PID {pid}")
        return InterruptOutcome(True, self.name, level, f"SIGTERM sent to PID {pid}", (pid,))
