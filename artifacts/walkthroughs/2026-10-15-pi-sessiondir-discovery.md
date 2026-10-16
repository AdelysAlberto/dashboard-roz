---
title: Pi sessionDir discovery fix for Subagent Monitor
module: "backend / monitor / providers"
author: homero
date: 2026-10-15
status: Done
priority: P1
scope: "[MVP]"
source: user_request
---

# Pi sessionDir discovery fix for Subagent Monitor

## Root cause

`server/providers/pi_provider.py` resolved the scan root once at import time:

```python
SESSIONS_ROOT = Path(os.environ.get("PI_SESSIONS_DIR", "~/.pi/agent/sessions"))
```

The Pi harness on this machine writes live sessions to a custom directory
(`sessionDir: /Volumes/Datos/Projects/session` in `~/.pi/agent/settings.json`).
That setting was only consumed by `_settings_session_dir()` -> `_extra_parent_dirs()`
(name-map enrichment), never by the actual scan root. Result: the monitor enumerated
only the stale legacy directory (newest file 2026-09-19), so all 33 `pi` primaries
returned by `GET /api/monitor/sessions` were `ended` with idle >= 2.2e6 s while real
sessions were active. Secondary defect: `tail_log()` / `kill_session()` validated paths
against the same wrong root, so any session stored under the real `sessionDir` would
raise `ValueError: Path outside Pi sessions dir` even if it had been listed.

## Evidence

- `~/.pi/agent/sessions`: 104 jsonl files, newest mtime 2026-09-19 (dead history).
- `/Volumes/Datos/Projects/session`: flat layout with live sessions from 2026-10-15:
  - `2026-10-15T19-55-18-263Z_01a14122-…​.jsonl` — provider `mimo`, model `mimo-v2.6-flash`, cwd `/Volumes/Datos/Projects/services/roz`.
  - `2026-10-15T19-58-59-083Z_…​.jsonl` — pid-correlatable (`pid=41505`, process lstart matches file creation within seconds).
- Layouts to support: (1) legacy `<root>/--<cwd-slug>--/[subagents/]` and (2) flat custom
  `sessionDir` where `<root>/<parentBase>/<childId>/run-N/session.jsonl` are subagent child
  sessions and `<root>/subagent-artifacts/` is durable artifacts (not sessions).

## Changes

All in `server/providers/pi_provider.py` (no frontend, `app.py` or `opencode_provider.py` touched):

1. **`_session_roots()`** — resolves at call time (no module-level caching):
   `PI_SESSIONS_DIR` env (`:`/`,` separated list) -> else `sessionDir` from
   `~/.pi/agent/settings.json` -> else legacy; the legacy `~/.pi/agent/sessions` root is
   always appended (deduped, order preserved, only if it exists) so September history stays visible.
2. **`list_sessions()`** walks every root and discovers:
   (a) flat root-level `*.jsonl` as `kind="primary"`;
   (b) `--cwd--` project dirs as before (primaries + `subagents/*.jsonl`);
   (c) `<root>/<base>/<childId>/run-*/session.jsonl` as `kind="subagent"`, skipping
   `subagent-artifacts` and any nested file whose resolved path equals a `status.json`
   `sessionFile` already reported by `list_async_subagents()` (`_async_reported_session_files()`).
   Dedupe by session id is preserved.
3. **`_stale_oversized()`** — the `_PRIMARY_MAX_BYTES` (2 MB) guard is now stale-aware:
   an oversized file is skipped only when its mtime is older than `STALL_SECONDS`, so a
   long live session never disappears from the monitor (parsing an 8 MB session measured at 25 ms; UI polls every 4 s).
4. **`_under_session_roots()`** — `tail_log()` and `kill_session()` now validate paths
   against every `_session_roots()` entry instead of the single hardcoded root.
5. `_load_name_map()` searches the project slug dir under every root (flat-layout roots have no slug dirs, so they fall back to root-level files for the name map).

## Verification

- `./stop.sh && ./start.sh` — Roz restarted cleanly, API back up on `:8036`.
- `GET /api/monitor/sessions`: 334 rows total, 214 `pi` (50 `pi`/primary), **9 non-ended pi primaries**
  including `mimo-v2.6-flash` (roz cwd, `state=quiet`, idle 66 s) and `pid=41505` correlated
  (`deepseek-flash`, roz; health label varies with idle: `active`/`quiet`/`stalled`).
- `len(rows) == len({row["id"] for row in rows})` — asserted, no duplicate cards.
- `GET /api/monitor/log?path=/Volumes/Datos/Projects/session/2026-10-15T19-55-18-263Z_01a14122-….jsonl&lines=5`
  returns live events (`result`/`thinking` entries), no error payload — previously `ValueError`.
- `python3 -m py_compile server/providers/pi_provider.py` — clean.

## Residual risks

- `_live_subagent_pids()` classifies a pi child process as a subagent only when its parent
  process is also `pi`; pi-subagents children are spawned from a Node runner, so that
  heuristic can steal a pid match (primary shows `pid=None`). Out of scope for this fix.
- Flat root is capped at the newest 20 primary files per root (same limit as legacy dirs);
  older live sessions beyond that window would need the limit raised.
