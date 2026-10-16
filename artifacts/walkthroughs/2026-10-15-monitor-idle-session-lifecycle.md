---
title: "Monitor: settled pi sessions must not stay red (stalled) forever"
module: "backend / monitor / providers"
author: homero
date: 2026-10-15
status: Done
priority: P1
scope: "[MVP]"
source: user_request
---

# Monitor: idle session lifecycle for pi sessions

## Root cause

`server/providers/pi_provider.py::_summarize_session()` used `pid is not None`
as the only liveness signal for primary sessions. Any pi process left open in a
pane — even when the agent had finished its turn hours earlier — produced:

```python
if not live: "ended"
elif idle > STALL_SECONDS: "stalled"   # live pid => red forever
```

The monitor filled with red "Unresponsive" cards for settled sessions
(tail = `assistant` with only `thinking`/`text` blocks), waiting for human input.

## Evidence

Measured on the live API before the fix (visible with `hideEnded=true`):

```
stalled pi primary pid=9702   idle=15609s  app            mimo-v2.6-pro
stalled pi primary pid=38723  idle=35803s  app            deepseek-flash
stalled pi primary pid=85305  idle=103189s route-factory  deepseek-flash
```

All three pids are alive (`ps -o lstart` matches the file creation stamp within
10 s, so the correlation is correct — the process really is open). The session
jsonl has no terminal marker (verified event types: `session`, `model_change`,
`thinking_level_change`, `message`, `custom`, `context_edit`), so the only
"settled" signal available is the shape of the tail. Internal precedent:
`opencode_provider.py` already maps a settled session (`idle_outcome`) to
`ended`, and `pilot.py` already reaps abandoned sessions after `PI_IDLE_TTL`
(1800 s). The pi provider was the inconsistent one.

## State rule

The entry loop tracks the tail (`custom`/`context_edit` do NOT update it):

- `tail_role` = role of the last `message`; `tail_tool` = that message is
  `assistant` and carries a `type == "toolCall"` block.
- `in_flight = tail_role in ("toolResult", "user") or (tail_role == "assistant" and tail_tool)`.
  An empty tail (no messages) counts as settled.

New rule (exact order), with `_idle_ttl()` reading `PI_IDLE_TTL` (default 1800)
at call time:

```python
if not live or idle > _idle_ttl():
    state = "ended"            # terminal: process gone or abandoned (hard TTL)
elif in_flight and idle > STALL_SECONDS:
    state = "stalled"          # red ONLY while the agent holds the turn in silence
elif idle > QUIET_SECONDS:
    state = "quiet"
else:
    state = "active"
```

A settled session (agent answered, waiting for the human) is never red: it turns
amber `quiet` and then `ended` after the TTL. The four state names are unchanged.

## Verification

Operator-visible result, measured by the reviewer against the restarted server:

```
total 337 · unique ids 337 · visible (state != ended) = 2
  active pi primary pid=41505 idle=0  roz  deepseek-flash
  active pi primary pid=None  idle=1  app  dell3-heretic
stalled pids 9702/38723/85305 -> all ended
```

Synthetic matrix (in-process, real `_summarize_session`, temp jsonl with old
message timestamps and old mtime; default TTL 1800 s). `pid=None` on a primary
is not "live" (`live` requires a correlated pid or `idle <= STALL_SECONDS`), an
unchanged pre-existing rule:

| tail shape  | idle 5 s | idle 60 s | idle 600 s (pid) | idle 600 s (no pid) | idle 3600 s |
| :---------- | :------- | :-------- | :--------------- | :------------------ | :---------- |
| settled     | active   | quiet     | `quiet`          | ended               | ended       |
| in_flight   | active   | quiet     | `stalled`        | ended               | ended       |
| toolResult  | active   | quiet     | `stalled`        | ended               | ended       |
| user        | active   | quiet     | `stalled`        | ended               | ended       |

- `PI_IDLE_TTL=60` in-process: a settled session with idle 90 s → `ended`, while
  an in-flight one with idle 30 s stays non-ended. The TTL has teeth.
- `python3 -m py_compile server/providers/pi_provider.py` → clean.
- `./stop.sh && ./start.sh` → server back up on http://127.0.0.1:8036.
- No regression on a genuinely running session: `2026-10-15T19-58-59-083Z_…jsonl`
  (tail = assistant with `toolCall`, pid 41505 alive) is never `ended` by the TTL
  rule; while holding the turn in silence > 180 s it reports `stalled` (correct).

## Residual risks

- (a) A session waiting for the human to answer `ask_user_question` holds the
  turn, so it reads as `stalled` until `PI_IDLE_TTL` elapses.
- (b) A silent tool call longer than `PI_IDLE_TTL` is classified `ended` until it
  writes again; it reappears by itself on the next write.
- (c) A primary whose pid cannot be correlated (resumed session) is not "live"
  once `idle > STALL_SECONDS`, so an in-flight long tool on such a session is
  reported `ended` rather than `stalled`. Pre-existing `live` definition, not
  touched by this fix.
- (d) Changing `PI_IDLE_TTL` requires a server restart (read at call time, but
  the value comes from the `.env` loaded at process start).
