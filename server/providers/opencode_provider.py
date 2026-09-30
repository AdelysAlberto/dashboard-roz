"""OpenCode agent provider for monitoring OpenCode sessions and background subagents."""

from __future__ import annotations

import json
import os
import re
import signal
import sqlite3
import subprocess
import time
from pathlib import Path
from typing import Any

from server.providers.base import BaseAgentProvider

OPENCODE_DB_PATH = Path(
    os.environ.get(
        "OPENCODE_DB_PATH",
        os.path.expanduser("~/.local/share/opencode/opencode.db"),
    )
)

STALL_SECONDS = 180
QUIET_SECONDS = 25
_TAG_RE = re.compile(r"\b(TASK(?:[-_][A-Z0-9]+)+|P(?:LAN)?[-_]T\d+\b|T\d+\b)\b", re.I)


def _tag_of(task: str) -> str:
    m = _TAG_RE.search(task)
    return m.group(1).upper() if m else ""


def _live_opencode_pids() -> list[int]:
    try:
        out = subprocess.run(
            ["ps", "-axo", "pid=,ppid=,command="],
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout
    except Exception:  # noqa: BLE001
        return []
    pids = []
    for line in out.splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) < 3:
            continue
        pid, ppid, cmd = parts
        if "opencode" in cmd.lower() and "grep" not in cmd and "uvicorn" not in cmd and "python" not in cmd:
            pids.append(int(pid))
    return pids


def _get_db_connection() -> sqlite3.Connection | None:
    if not OPENCODE_DB_PATH.exists():
        return None
    try:
        conn = sqlite3.connect(
            f"file:{OPENCODE_DB_PATH}?mode=ro",
            uri=True,
            timeout=5.0,
            check_same_thread=False,
        )
        conn.row_factory = sqlite3.Row
        return conn
    except Exception:  # noqa: BLE001
        return None


class OpenCodeAgentProvider(BaseAgentProvider):
    """Provider for discovering, reading logs and controlling OpenCode agents."""

    name = "opencode"

    def list_sessions(self, project_cwds: list[str]) -> list[dict[str, Any]]:
        conn = _get_db_connection()
        if conn is None:
            return []

        out: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        now_sec = time.time()
        live_pids = _live_opencode_pids()
        has_live_service = len(live_pids) > 0
        primary_pid = live_pids[0] if live_pids else None

        try:
            cur = conn.cursor()

            # Check if session_v2 table exists
            has_v2 = False
            try:
                table_check = cur.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='session_v2'"
                ).fetchone()
                has_v2 = table_check is not None
            except Exception:
                has_v2 = False

            # 1. Fetch from session_v2 (modern OpenCode)
            if has_v2:
                v2_rows = cur.execute(
                    """
                    SELECT
                        id,
                        parent_id,
                        slug,
                        directory,
                        title,
                        agent,
                        model,
                        cost,
                        tokens_input,
                        tokens_output,
                        tokens_reasoning,
                        time_created,
                        time_updated,
                        idle_outcome
                    FROM session_v2
                    ORDER BY time_updated DESC
                    LIMIT 80
                    """
                ).fetchall()

                for r in v2_rows:
                    sid = r["id"]
                    seen_ids.add(sid)
                    parent_id = r["parent_id"]
                    agent = (r["agent"] or "").strip()
                    directory = r["directory"] or ""
                    title = (r["title"] or "").strip()
                    t_created_ms = r["time_created"] or 0
                    t_updated_ms = r["time_updated"] or t_created_ms

                    idle_sec = max(0, int(now_sec - (t_updated_ms / 1000.0))) if t_updated_ms else 0

                    kind = "subagent" if (parent_id or (agent and agent not in ("primary", "build", "sesión"))) else "primary"
                    if not agent:
                        agent = "sesión" if kind == "primary" else "subagent"

                    # Calculate state
                    idle_outcome = r["idle_outcome"]
                    if not has_live_service or idle_sec > (24 * 3600):
                        state = "ended"
                    elif idle_sec > STALL_SECONDS:
                        state = "ended" if idle_outcome else "stalled"
                    elif idle_sec > QUIET_SECONDS:
                        state = "ended" if (idle_outcome and idle_sec > 60) else "quiet"
                    else:
                        state = "active"

                    # Messages count & last activity from session_message
                    msg_count_row = cur.execute(
                        "SELECT count(*) as c FROM session_message WHERE session_id = ?", (sid,)
                    ).fetchone()
                    msg_count = msg_count_row["c"] if msg_count_row else 0

                    # Determine best task description
                    task_text = title if (title and not title.startswith("New session -")) else ""
                    if not task_text:
                        first_msg = cur.execute(
                            """
                            SELECT data
                            FROM session_message
                            WHERE session_id = ? AND type = 'user'
                            ORDER BY seq ASC
                            LIMIT 1
                            """,
                            (sid,),
                        ).fetchone()
                        if first_msg:
                            try:
                                fm_data = json.loads(first_msg["data"])
                                if fm_data.get("text"):
                                    raw = fm_data["text"]
                                    task_text = re.sub(r"^You are a subagent spawned by another session\.\s*", "", raw).strip()
                            except Exception:  # noqa: BLE001
                                pass
                    if not task_text:
                        task_text = title or "Sin descripción de tarea"

                    # Last activity from latest assistant message
                    last_activity = ""
                    last_msg = cur.execute(
                        """
                        SELECT data
                        FROM session_message
                        WHERE session_id = ? AND type = 'assistant'
                        ORDER BY seq DESC
                        LIMIT 1
                        """,
                        (sid,),
                    ).fetchone()

                    if last_msg:
                        try:
                            lm_data = json.loads(last_msg["data"])
                            contents = lm_data.get("content") or []
                            for c in reversed(contents):
                                if not isinstance(c, dict):
                                    continue
                                ct = c.get("type")
                                if ct == "tool":
                                    tool_name = c.get("tool") or c.get("name") or "tool"
                                    st = c.get("state") or {}
                                    inp = st.get("input") or c.get("arguments") or {}
                                    inp_prev = (
                                        inp.get("command")
                                        or inp.get("filePath")
                                        or inp.get("path")
                                        or inp.get("pattern")
                                        or inp.get("query")
                                        or json.dumps(inp, ensure_ascii=False)[:100]
                                    )
                                    last_activity = f"{tool_name} {inp_prev}"[:160]
                                    break
                                elif ct == "reasoning":
                                    last_activity = f"pensando: {c.get('text', '').strip()[:80]}"
                                    break
                                elif ct == "text" and c.get("text"):
                                    last_activity = f"escribiendo: {c.get('text', '').strip()[:80]}"
                                    break
                        except Exception:  # noqa: BLE001
                            pass

                    tokens_total = int(
                        (r["tokens_input"] or 0)
                        + (r["tokens_output"] or 0)
                        + (r["tokens_reasoning"] or 0)
                    )
                    cost = float(r["cost"] or 0.0)
                    project_name = os.path.basename(os.path.abspath(directory).rstrip("/")) if directory else ""

                    out.append(
                        {
                            "provider": "opencode",
                            "path": f"opencode://{sid}",
                            "kind": kind,
                            "id": sid,
                            "cwd": directory,
                            "project": project_name,
                            "agent": agent,
                            "task": task_text.strip()[:200],
                            "task_tag": _tag_of(task_text),
                            "state": state,
                            "idle_seconds": idle_sec,
                            "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t_created_ms / 1000.0))
                            if t_created_ms
                            else "",
                            "updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t_updated_ms / 1000.0))
                            if t_updated_ms
                            else "",
                            "messages": msg_count,
                            "tokens": tokens_total,
                            "cost": round(cost, 4),
                            "pid": primary_pid if state in ("active", "quiet", "stalled") else None,
                            "last_activity": last_activity or ("(activo)" if state == "active" else "(sin actividad registrada)"),
                            "size": 0,
                        }
                    )

            # 2. Also check legacy session table if any
            try:
                legacy_rows = cur.execute(
                    """
                    SELECT
                        id,
                        parent_id,
                        slug,
                        directory,
                        title,
                        agent,
                        model,
                        cost,
                        tokens_input,
                        tokens_output,
                        time_created,
                        time_updated
                    FROM session
                    ORDER BY time_updated DESC
                    LIMIT 40
                    """
                ).fetchall()

                for r in legacy_rows:
                    sid = r["id"]
                    if sid in seen_ids:
                        continue
                    seen_ids.add(sid)
                    parent_id = r["parent_id"]
                    agent = (r["agent"] or "").strip()
                    directory = r["directory"] or ""
                    title = (r["title"] or "").strip()
                    t_created_ms = r["time_created"] or 0
                    t_updated_ms = r["time_updated"] or t_created_ms
                    idle_sec = max(0, int(now_sec - (t_updated_ms / 1000.0))) if t_updated_ms else 0

                    kind = "subagent" if (parent_id or (agent and agent not in ("primary", "sesión"))) else "primary"
                    if not agent:
                        agent = "sesión" if kind == "primary" else "subagent"

                    state = "ended"
                    tokens_total = int((r["tokens_input"] or 0) + (r["tokens_output"] or 0))
                    cost = float(r["cost"] or 0.0)
                    project_name = os.path.basename(os.path.abspath(directory).rstrip("/")) if directory else ""

                    out.append(
                        {
                            "provider": "opencode",
                            "path": f"opencode://{sid}",
                            "kind": kind,
                            "id": sid,
                            "cwd": directory,
                            "project": project_name,
                            "agent": agent,
                            "task": title.strip()[:200],
                            "task_tag": _tag_of(title),
                            "state": state,
                            "idle_seconds": idle_sec,
                            "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t_created_ms / 1000.0))
                            if t_created_ms
                            else "",
                            "updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t_updated_ms / 1000.0))
                            if t_updated_ms
                            else "",
                            "messages": 0,
                            "tokens": tokens_total,
                            "cost": round(cost, 4),
                            "pid": None,
                            "last_activity": "(finalizado)",
                            "size": 0,
                        }
                    )
            except Exception:  # noqa: BLE001
                pass

        finally:
            conn.close()

        return out

    def tail_log(self, target: str, lines: int = 120) -> list[dict[str, Any]]:
        sid = target.replace("opencode://", "").strip()
        conn = _get_db_connection()
        if conn is None:
            return []

        out: list[dict[str, Any]] = []
        try:
            cur = conn.cursor()

            # 1. Try session_message (modern OpenCode)
            msg_rows = cur.execute(
                """
                SELECT type, time_created, data
                FROM session_message
                WHERE session_id = ?
                ORDER BY seq ASC
                """,
                (sid,),
            ).fetchall()

            if msg_rows:
                for r in msg_rows:
                    m_type = r["type"]
                    t_ms = r["time_created"] or 0
                    ts = time.strftime("%H:%M:%S", time.gmtime(t_ms / 1000.0)) if t_ms else ""
                    try:
                        d = json.loads(r["data"])
                    except Exception:
                        continue

                    if m_type == "user":
                        text_val = d.get("text") or ""
                        if text_val:
                            out.append({"ts": ts, "kind": "user", "text": text_val[:400]})
                    elif m_type == "assistant":
                        contents = d.get("content") or []
                        for c in contents:
                            if not isinstance(c, dict):
                                continue
                            ct = c.get("type")
                            if ct == "reasoning":
                                r_text = c.get("text") or ""
                                if r_text:
                                    out.append({"ts": ts, "kind": "thinking", "text": r_text[:400]})
                            elif ct == "text":
                                t_text = c.get("text") or ""
                                if t_text:
                                    out.append({"ts": ts, "kind": "text", "text": t_text[:800]})
                            elif ct == "tool":
                                tool_name = c.get("tool") or c.get("name") or "tool"
                                st = c.get("state") or {}
                                inp = st.get("input") or c.get("arguments") or {}
                                brief = (
                                    inp.get("command")
                                    or inp.get("filePath")
                                    or inp.get("path")
                                    or inp.get("pattern")
                                    or inp.get("query")
                                    or json.dumps(inp, ensure_ascii=False)[:200]
                                )
                                out.append({"ts": ts, "kind": "tool", "tool": tool_name, "text": str(brief)[:400]})

                                output = st.get("output")
                                if output:
                                    out.append({"ts": ts, "kind": "result", "tool": tool_name, "text": str(output)[:200]})

            # 2. Fallback to part table (legacy)
            if not out:
                part_rows = cur.execute(
                    """
                    SELECT p.time_created, p.data
                    FROM part p
                    WHERE p.session_id = ?
                    ORDER BY p.time_created ASC
                    """,
                    (sid,),
                ).fetchall()

                for r in part_rows:
                    t_ms = r["time_created"] or 0
                    ts = time.strftime("%H:%M:%S", time.gmtime(t_ms / 1000.0)) if t_ms else ""
                    try:
                        d = json.loads(r["data"])
                    except Exception:
                        continue

                    p_type = d.get("type")
                    if p_type == "text":
                        out.append({"ts": ts, "kind": "text", "text": (d.get("text") or "")[:800]})
                    elif p_type == "reasoning":
                        out.append({"ts": ts, "kind": "thinking", "text": (d.get("text") or "")[:400]})
                    elif p_type == "tool":
                        tool_name = d.get("tool", "tool")
                        state = d.get("state") or {}
                        inp = state.get("input") or {}
                        brief = (
                            inp.get("command")
                            or inp.get("filePath")
                            or inp.get("path")
                            or inp.get("pattern")
                            or inp.get("query")
                            or json.dumps(inp, ensure_ascii=False)[:200]
                        )
                        out.append({"ts": ts, "kind": "tool", "tool": tool_name, "text": str(brief)[:400]})

                        if state.get("output"):
                            res_str = str(state.get("output"))[:200]
                            out.append({"ts": ts, "kind": "result", "tool": tool_name, "text": res_str})
        finally:
            conn.close()

        return out[-lines:]

    def kill_session(self, target: str) -> int:
        pids = _live_opencode_pids()
        if not pids:
            raise RuntimeError("No live OpenCode process found")
        pid = pids[0]
        os.kill(pid, signal.SIGTERM)
        return pid
