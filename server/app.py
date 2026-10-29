"""Roz — markdown tracker dashboard."""

from __future__ import annotations

import os
import time
from pathlib import Path

from dotenv import load_dotenv

BASE = Path(__file__).resolve().parent.parent
load_dotenv(BASE / ".env")

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from server import (  # noqa: E402
    auth,
    engines_api,
    image_test_api,
    image_test_local_api,
    latigazo,
    llm_test_api,
    mdstore,
    mflux_local,
    monitor,
    pilot,
    services_api,
    skills_api,
)

app = FastAPI(title="roz")

# HTTP Basic on everything that arrives from off-box. Loopback stays open so the
# local tooling and the documented `curl 127.0.0.1:PORT` checks keep working.
_CREDENTIALS = auth.credentials_from_env()
if _CREDENTIALS:
    app.add_middleware(auth.BasicAuthMiddleware, **_CREDENTIALS)
app.include_router(services_api.router)
app.include_router(engines_api.router)
app.include_router(skills_api.router)
app.include_router(llm_test_api.router)
app.include_router(image_test_api.router)
app.include_router(image_test_local_api.router)

WEB = BASE / "web"


@app.on_event("startup")
def _startup():
    paths = [p.strip() for p in os.environ.get("ROZ_SCAN_PATHS", "").split(",") if p.strip()]
    mdstore.init_roots(paths)
    host = os.environ.get("ROZ_HOST", "127.0.0.1")
    gate = f"basic auth for {_CREDENTIALS['user']}" if _CREDENTIALS else "NO AUTH"
    print(f"[roz] bind {host} · {gate} (loopback exempt)")


@app.on_event("shutdown")
def _shutdown():
    # A resident mflux worker holds 22 GB of weights. Nobody else will reap it.
    mflux_local.shutdown()


# ── API ────────────────────────────────────────────────────────────────

class RootIn(BaseModel):
    path: str


@app.get("/api/roots")
def get_roots():
    return {"roots": mdstore.list_roots()}


@app.post("/api/roots")
def post_root(body: RootIn):
    try:
        return {"root": mdstore.add_root(body.path)}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.delete("/api/roots")
def del_root(body: RootIn):
    mdstore.remove_root(body.path)
    return {"roots": mdstore.list_roots()}


@app.get("/api/docs")
def get_docs():
    return {"docs": mdstore.scan_all()}


@app.get("/api/doc")
def get_doc(path: str):
    try:
        return {"content": mdstore.read_file(path), "meta": mdstore.parse_document(Path(path))}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


class StatusIn(BaseModel):
    path: str
    status: str


@app.post("/api/status")
def post_status(body: StatusIn):
    try:
        return mdstore.set_status(body.path, body.status)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


class MoveIn(BaseModel):
    path: str
    dest: str


@app.post("/api/move")
def post_move(body: MoveIn):
    try:
        return mdstore.move_file(body.path, body.dest)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


class PathIn(BaseModel):
    path: str


@app.post("/api/delete")
def post_delete(body: PathIn):
    try:
        mdstore.delete_file(body.path)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


class AnalyzeIn(BaseModel):
    path: str
    prompt: str
    agent: str | None = None


@app.post("/api/analyze")
async def post_analyze(body: AnalyzeIn):
    try:
        content = mdstore.read_file(body.path)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    prompt = body.prompt.replace("{file}", body.path).replace("{content}", content)
    run = await pilot.registry.create(prompt, body.agent, body.path)
    return {"run_id": run.run_id}


class PromptIn(BaseModel):
    run_id: str
    message: str


@app.post("/api/analyze/prompt")
async def post_followup(body: PromptIn):
    run = pilot.registry.get(body.run_id)
    if run is None:
        raise HTTPException(404, "unknown run")
    if run.exited:
        raise HTTPException(409, "session already finished")
    try:
        await run.prompt(body.message)
        return {"ok": True}
    except RuntimeError as e:
        raise HTTPException(409, str(e)) from e


class RunIdIn(BaseModel):
    run_id: str


class UiAnswerIn(BaseModel):


    run_id: str
    request_id: str
    payload: dict  # {value: str} | {confirmed: bool} | {cancelled: true}


@app.post("/api/analyze/answer")
async def post_answer(body: UiAnswerIn):
    run = pilot.registry.get(body.run_id)
    if run is None:
        raise HTTPException(404, "unknown run")
    try:
        await run.answer_ui(body.request_id, body.payload)
        return {"ok": True}
    except RuntimeError as e:
        raise HTTPException(409, str(e)) from e


@app.get("/api/analyze/{run_id}/state")
def get_run_state(run_id: str):
    run = pilot.registry.get(run_id)
    if run is None:
        raise HTTPException(404, "unknown run")
    return {"exited": run.exited, "idle": run.idle, "events": len(run.events)}


@app.post("/api/analyze/close")
async def post_close_run(body: RunIdIn):
    run = pilot.registry.get(body.run_id)
    if run is None:
        raise HTTPException(404, "unknown run")
    await run.close()
    return {"ok": True}


# ── monitor: subagent sessions ────────────────────────────────────

def _monitor_cwds() -> list[str]:
    cwds = [pilot.CONFIG["project_dir"]]
    for r in mdstore.list_roots():
        if r not in cwds:
            cwds.append(r)
    return cwds


@app.get("/api/monitor/sessions")
def get_monitor_sessions():
    sessions = monitor.list_sessions(_monitor_cwds())
    return {"sessions": sessions, "latigazo": _watchdog(sessions), "cache": monitor.cache_stats()}


@app.post("/api/monitor/cache/refresh")
def post_monitor_cache_refresh():
    """Drop the transcript cache. The next listing re-reads every JSONL from disk."""
    return {"ok": True, "cache": monitor.refresh_cache()}


_WATCHDOG_INTERVAL = int(os.environ.get("ROZ_WATCHDOG_INTERVAL", "15"))
_last_watchdog = [0.0]


def _watchdog(sessions: list[dict]) -> list[dict]:
    """Run the latigazo over fresh telemetry, throttled.

    The dashboard already polls this endpoint every few seconds, so the
    watchdog rides that pass instead of scanning the process table twice.
    """
    now = time.time()
    if now - _last_watchdog[0] < _WATCHDOG_INTERVAL:
        return latigazo.audit()
    _last_watchdog[0] = now
    actions = latigazo.run(sessions, monitor.interrupt_session)
    if actions:
        for a in actions:
            print(
                f"[latigazo] {a['level']} {a['provider']} {a['agent'] or a['path']} "
                f"ok={a['ok']} :: {a['detail']}"
            )
    # Surface the last automatic cut on the session it hit, so the dashboard
    # can say what it did without a second endpoint.
    latest: dict[str, dict] = {}
    for entry in latigazo.audit():
        latest[entry["path"]] = entry
    for session in sessions:
        hit = latest.get(str(session.get("path") or ""))
        if hit:
            session["latigazo"] = hit
    return latigazo.audit()


class SessionIn(BaseModel):
    path: str


class InterruptIn(BaseModel):
    path: str
    level: str = "tool"


@app.post("/api/monitor/interrupt")
def post_monitor_interrupt(body: InterruptIn):
    """Latigazo: cut the tool in flight ('tool'), the turn ('turn') or the agent ('kill')."""
    try:
        return monitor.interrupt_session(body.path, body.level)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(400, str(e)) from e


@app.get("/api/monitor/log")
def get_monitor_log(path: str, lines: int = 120):
    try:
        return {"events": monitor.tail_log(path, min(int(lines), 400))}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.post("/api/monitor/wake")
def post_monitor_wake(body: SessionIn):
    """Legacy alias of level `kill`. Prefer /api/monitor/interrupt: cutting the
    tool in flight ('tool') recovers a wedged session without losing the turn."""
    try:
        pid = monitor.kill_session(body.path)
        return {"ok": True, "pid": pid}
    except (ValueError, RuntimeError) as e:
        raise HTTPException(400, str(e)) from e


@app.get("/api/validate")
def validate_docs():
    """Read-only frontmatter convention audit over all scan roots."""
    return mdstore.validate_all()


def _advertised_agents() -> list[str]:
    """PI_AGENTS filtered by personas that exist, so the dropdown has no dead options."""
    raw = [a.strip() for a in os.environ.get("PI_AGENTS", "none").split(",") if a.strip()]
    available = set(pilot.available_agents())
    if not available:
        return raw or ["none"]
    kept = [a for a in raw if a == "none" or a in available]
    return kept or ["none"]


@app.get("/api/config")
def get_config():
    return {
        "model": pilot.CONFIG["model"],
        "project_dir": pilot.CONFIG["project_dir"],
        "agents": _advertised_agents(),
        "done_dir": os.environ.get("ROZ_DONE_DIR", ""),
        "pi_bin": pilot.CONFIG["pi_bin"],
    }


# ── WS: live analysis events ───────────────────────────────────────────

@app.websocket("/ws/analyze/{run_id}")
async def ws_analyze(ws: WebSocket, run_id: str, since: int = 0):
    await ws.accept()
    run = pilot.registry.get(run_id)
    if run is None:
        await ws.send_json({"type": "roz_error", "message": f"unknown run {run_id}"})
        await ws.close()
        return
    try:
        async for ev in run.subscribe(from_index=max(0, since)):
            await ws.send_json(ev)  # already compacted by pilot
        try:
            await ws.close()
        except Exception:  # noqa: BLE001
            pass
    except WebSocketDisconnect:
        pass
    except Exception as e:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        try:
            await ws.send_json({"type": "roz_error", "message": f"ws pump failed: {e}"})
            await ws.close()
        except Exception:  # noqa: BLE001
            pass


# ── UI ─────────────────────────────────────────────────────────────────

FRONTEND_DIST = BASE / "frontend" / "dist"

if (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

app.mount("/static", StaticFiles(directory=WEB), name="static")


@app.get("/")
def index():
    if (FRONTEND_DIST / "index.html").exists():
        return FileResponse(FRONTEND_DIST / "index.html")
    return FileResponse(WEB / "index.html")

