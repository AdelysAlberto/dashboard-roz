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

from server.providers.base import BaseAgentProvider

SESSIONS_ROOT = Path(
    os.environ.get("PI_SESSIONS_DIR", os.path.expanduser("~/.pi/agent/sessions"))
)

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


def _project_label(safe_dir: str) -> str:
    name = safe_dir.strip("-")
    return name.rsplit("-", 1)[-1] if "-" in name else name


def _extract_subagent_calls(dirs: list[Path], limit_files: int) -> list[dict]:
    files: list[Path] = []
    for d in dirs:
        if d.is_dir():
            files.extend(sorted(d.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)[:limit_files])
    entries: list[dict] = []
    for f in files:
        for d_ in _iter_entries(f):
            m = d_.get("message") or {}
            if m.get("role") != "assistant":
                continue
            for c in m.get("content") or []:
                if isinstance(c, dict) and c.get("type") == "toolCall" and c.get("name") == "subagent":
                    a = c.get("arguments") or {}
                    if a.get("task"):
                        entries.append({"agent": str(a.get("agent", "?")), "task": str(a["task"])})
    return entries


def _load_name_map(project_cwd: str, limit_files: int = 8) -> list[dict]:
    return _extract_subagent_calls([SESSIONS_ROOT / _safe_project_dir(project_cwd)] + _extra_parent_dirs(), limit_files)


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


def _summarize_session(path: Path, pid: int | None, name_map: list[dict], *, kind: str = "subagent") -> dict:
    header: dict = {}
    task = ""
    last_ts = 0.0
    last_activity = ""
    msgs = 0
    tokens = 0
    cost = 0.0
    for d in _iter_entries(path):
        if d.get("type") == "session":
            header = d
            continue
        m = d.get("message")
        if not m:
            continue
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

    agent = _lookup_agent(task, name_map)
    now = time.time()
    mtime = path.stat().st_mtime
    idle = now - max(mtime, last_ts) if (mtime or last_ts) else 0
    live = pid is not None or (
        kind == "primary" and idle <= STALL_SECONDS and now - mtime <= PRIMARY_LIVE_MTIME
    )
    if not live:
        state = "ended"
    elif idle > STALL_SECONDS:
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
    }


class PiAgentProvider(BaseAgentProvider):
    """Provider for discovering, reading logs and controlling Pi agents."""

    name = "pi"

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

        if not SESSIONS_ROOT.is_dir():
            return out

        # 2. Legacy sessions
        sub_pids = _live_subagent_pids()
        prim_pids = _live_primary_pids()
        name_maps: dict[Path, list[dict]] = {}

        session_dirs: dict[Path, str] = {}
        for cwd in project_cwds:
            d = SESSIONS_ROOT / _safe_project_dir(cwd)
            if d.is_dir():
                session_dirs[d] = cwd
        if SESSIONS_ROOT.is_dir():
            for d in sorted(SESSIONS_ROOT.iterdir()):
                if d.is_dir() and d.name.startswith("--") and d.name.endswith("--") and d not in session_dirs:
                    session_dirs[d] = ""

        for d, cwd in session_dirs.items():
            if d not in name_maps:
                name_maps[d] = _load_name_map(cwd) if cwd else _load_name_map_from_dir(d)
            subdir = d / "subagents"
            if subdir.is_dir():
                for f in sorted(subdir.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)[:50]:
                    pid = _match_pid(f, sub_pids)
                    summ = _summarize_session(f, pid, name_maps[d])
                    if summ["id"] not in seen_ids:
                        seen_ids.add(summ["id"])
                        out.append(summ)
            for f in sorted(d.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)[:20]:
                if f.stat().st_size > _PRIMARY_MAX_BYTES:
                    continue
                pid = _match_pid(f, prim_pids)
                s = _summarize_session(f, pid, [], kind="primary")
                if s["id"] in seen_ids:
                    continue
                seen_ids.add(s["id"])
                if cwd:
                    s["project"] = os.path.basename(os.path.abspath(cwd).rstrip("/")) or cwd
                else:
                    s["project"] = _project_label(d.name)
                out.append(s)
        return out

    def tail_log(self, target: str, lines: int = 120) -> list[dict[str, Any]]:
        fp = Path(target).expanduser().resolve()
        root = SESSIONS_ROOT.resolve()

        # Check if this is an async run event file
        is_async_file = False
        for adir in _async_runs_dirs():
            if adir.resolve() in fp.parents:
                is_async_file = True
                break

        if not is_async_file and (root not in fp.parents or fp.suffix != ".jsonl"):
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
                item = {"ts": time.strftime("%H:%M:%S", time.gmtime(ts_val / 1000.0)) if ts_val else ""}
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
            item = {"ts": time.strftime("%H:%M:%S", time.gmtime(ts / 1000)) if ts else ""}
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
        fp = Path(target).expanduser().resolve()
        root = SESSIONS_ROOT.resolve()

        # Check async runs
        for adir in _async_runs_dirs():
            if adir.resolve() in fp.parents or fp.parent == adir.resolve():
                rdir = fp if fp.is_dir() else fp.parent
                status_file = rdir / "status.json"
                if status_file.exists():
                    try:
                        data = json.loads(status_file.read_text("utf-8"))
                        pid = data.get("pid")
                        if pid:
                            os.kill(pid, signal.SIGTERM)
                            return pid
                    except Exception as e:
                        raise RuntimeError(f"failed to kill async process: {e}") from e
                raise RuntimeError("no live async process found")

        if root not in fp.parents or fp.suffix != ".jsonl":
            raise ValueError(f"Path outside Pi sessions dir: {target}")
        pid = _match_pid(fp, _live_subagent_pids())
        if pid is None:
            raise RuntimeError("no live process correlated with this session")
        os.kill(pid, signal.SIGTERM)
        return pid
