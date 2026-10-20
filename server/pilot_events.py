"""WS frame compaction for pilot events.

Kept out of ``pilot.py`` so the session/transport module stays within the
250-line budget; a huge ``message_end`` would otherwise flood the WebSocket.
"""

from __future__ import annotations

import json

_MAX_STR = 2000


def compact_event(ev: dict) -> dict:
    """Strip huge payloads (system prompts, session headers) so WS frames stay small."""
    t = ev.get("type")
    if t == "session":
        return {"type": "session", "cwd": ev.get("cwd", "")}
    if t == "message_start":
        return {"type": t, "role": ev.get("message", {}).get("role")}
    if t == "message_end":
        m = ev.get("message", {})
        c = m.get("content")
        if isinstance(c, str):
            c = c[:1000]
        elif isinstance(c, list):
            c = [
                p if not isinstance(p.get("text"), str) else {**p, "text": p["text"][:_MAX_STR]}
                for p in c
            ]
        return {"type": t, "role": m.get("role"), "content": c, "stopReason": m.get("stopReason")}
    if t == "message_update":
        d = ev.get("assistantMessageEvent", {})
        return {"type": t, "deltaType": d.get("type"), "delta": str(d.get("delta", ""))[:200]}
    if t == "tool_execution_end":
        r = ev.get("result")
        c = r.get("content") if isinstance(r, dict) else r
        if not isinstance(c, str):
            c = json.dumps(c, default=str)
        return {"type": t, "toolName": ev.get("toolName"), "content": c[:1200]}
    if t == "extension_ui_request":
        return {
            "type": t,
            "id": ev.get("id"),
            "method": ev.get("method"),
            "title": ev.get("title"),
            "message": ev.get("message") or ev.get("placeholder") or "",
            "options": ev.get("options"),
            "timeout": ev.get("timeout"),
        }
    if t in ("agent_start", "agent_settled", "turn_start", "ping"):
        return {"type": t}
    if t == "response":
        data = ev.get("data")
        return {"type": t, "command": ev.get("command"), "success": ev.get("success"),
                "data": json.dumps(data, default=str)[:400] if data else None}
    if t == "turn_end":
        return {"type": t}
    if t == "agent_end":
        return {"type": t, "willRetry": ev.get("willRetry")}

    def trim(x):
        if isinstance(x, str):
            return x[:_MAX_STR]
        if isinstance(x, dict):
            return {k: trim(v) for k, v in x.items()}
        if isinstance(x, list):
            return [trim(v) for v in x[:20]]
        return x
    return trim(ev)

