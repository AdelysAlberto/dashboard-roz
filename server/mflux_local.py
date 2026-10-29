"""The resident mflux worker, as seen from roz.

One worker at a time, because a Qwen-Image checkpoint is 22-24 GB of weights and
two of them is a swap storm, not a feature. The state lives here rather than in
the child so the dashboard can answer "is it loaded?" without asking a process
that is busy diffusing.

Loading returns immediately and the state moves ``loading`` -> ``ready`` on its
own thread: a real load (construct plus a warmup that materialises the weights)
takes a minute and no browser should hold a request open for it.
"""

from __future__ import annotations

import os
import threading
import time
from datetime import datetime
from pathlib import Path

from server import image_store, image_test, mflux_models
from server.mflux_bridge import Bridge, WorkerError

WORKER_SCRIPT = Path(__file__).resolve().parent / "mflux_worker.py"


class NotReady(RuntimeError):
    """The request conflicts with the worker's state; retrying later may work."""


def _timeout(name: str, fallback: int) -> float:
    try:
        return float(os.environ.get(name, str(fallback)) or fallback)
    except ValueError:
        return float(fallback)


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


_IDLE = {
    "phase": None,
    "started_at": None,
    "path": None,
    "name": None,
    "family": None,
    "error": None,
    "warning": None,
    "bits": None,
    "load_ms": None,
    "warmup": None,
    "warmup_ms": None,
    "generation_ms": None,
    "seed": None,
    "loaded_at": None,
}

_lock = threading.RLock()
_state: dict = {"state": "idle", **_IDLE}
_bridge = Bridge(WORKER_SCRIPT)

# The last finished image, kept apart from the worker state because it outlives
# an unload: reloading the page drops the HTTP response that carried the image,
# and this is the only record the browser can ask for afterwards.
_last_run: dict | None = None
_generation_started: float | None = None


def _set(**fields) -> None:
    with _lock:
        _state.update(fields)


def _progress(message: dict) -> None:
    """A status or warning line from the child, folded into the visible state."""
    if message.get("type") == "warn" or message.get("type") == "warning":
        _set(warning=message.get("message"))
    else:
        _set(phase=message.get("phase"))


# ── public surface ─────────────────────────────────────────────────────

def status() -> dict:
    with _lock:
        data = dict(_state)
        last_run = dict(_last_run) if _last_run else None
        started = _generation_started
    data["pid"] = _bridge.pid()
    data["last_run"] = last_run
    data["out_dir"] = str(image_store.out_dir())
    data["elapsed_ms"] = (
        int((time.time() - started) * 1000) if data["state"] == "generating" and started else None
    )
    data["python"] = mflux_models.python_for_mflux()
    data["available"] = mflux_models.mflux_available()
    data["default_path"] = mflux_models.default_model_path()
    data["loaded"] = data["state"] in ("ready", "generating")
    return data


def load(raw_path: str = "") -> dict:
    """Validate the folder, swap the worker, and answer before it is ready."""
    info = mflux_models.inspect_model(raw_path or mflux_models.default_model_path())
    if not info["compatible"]:
        raise ValueError(f"{info['name']}: {info['reason']}")
    if not mflux_models.mflux_available():
        raise ValueError(
            f"no mflux interpreter at {mflux_models.python_for_mflux()}: install it with "
            "`uv venv ~/.venvs/mflux && uv pip install --python ~/.venvs/mflux/bin/python mflux`"
        )
    with _lock:
        current = _state["state"]
        if current == "loading":
            raise NotReady("a model is already loading")
        if current == "generating":
            raise NotReady("a generation is running: wait for it or stop roz")
        if current == "ready" and _state["path"] == info["path"]:
            return status()
    _bridge.stop()
    _bridge.start(mflux_models.python_for_mflux())
    _set(
        state="loading",
        phase="spawning",
        path=info["path"],
        name=info["name"],
        family=info["family"],
        error=None,
        warning=None,
        **{
            key: None
            for key in _IDLE
            if key not in ("phase", "path", "name", "family", "error", "warning")
        },
    )
    threading.Thread(
        target=_load_job, args=(info["path"], str(info["family"])), daemon=True
    ).start()
    return status()


def _load_job(path: str, family: str) -> None:
    try:
        reply = _bridge.request(
            "load",
            _timeout("ROZ_MFLUX_LOAD_TIMEOUT", 1800),
            on_progress=_progress,
            path=path,
            family=family,
            warmup=True,
        )
    except WorkerError as exc:
        _set(state="error", phase=None, error=str(exc))
        _bridge.stop()
        return
    _set(
        state="ready",
        phase=None,
        load_ms=reply.get("load_ms"),
        bits=reply.get("bits"),
        warmup=reply.get("warmup"),
        warmup_ms=reply.get("warmup_ms"),
        family=reply.get("family") or family,
        loaded_at=_now(),
    )


def unload() -> dict:
    with _lock:
        if _state["state"] == "generating":
            raise NotReady("a generation is running: the worker keeps the model until it finishes")
    _bridge.stop()
    _set(state="idle", **_IDLE)
    return status()


def generate(spec: dict) -> dict:
    """One image from the loaded checkpoint. Blocks for minutes by design."""
    width, height = image_test.size_for(spec.get("orientation"))
    prompt = image_test.build_prompt(spec)
    steps, guidance = image_test.sampling(spec)
    raw_seed = str(spec.get("seed") or "").strip()
    seed = int(raw_seed) if raw_seed.isdigit() else None
    with _lock:
        if _state["state"] != "ready":
            raise NotReady(
                f"the local model is {_state['state']}: load a checkpoint before generating"
            )
        model_path = str(_state["path"])
        model_name = str(_state["name"])
        bits = _state["bits"]
        _state["state"] = "generating"
        _state["started_at"] = _now()
        _state["error"] = None
    global _generation_started
    _generation_started = time.time()
    target = image_store.target_path(str(spec.get("user_prompt") or prompt))
    payload = {
        "prompt": prompt,
        "negative_prompt": str(spec.get("negative_prompt") or "").strip(),
        "steps": steps,
        "guidance": guidance,
        "width": width,
        "height": height,
        "seed": seed,
    }
    started = time.perf_counter()
    try:
        reply = _bridge.request(
            "generate",
            _timeout("ROZ_MFLUX_GENERATE_TIMEOUT", 3600),
            out_path=str(target),
            **payload,
        )
    except WorkerError as exc:
        _set(
            state="ready" if _bridge.alive() else "error",
            phase=None,
            started_at=None,
            error=str(exc),
        )
        raise
    latency_ms = int((time.perf_counter() - started) * 1000)
    _set(state="ready", phase=None, started_at=None, generation_ms=latency_ms, seed=reply.get("seed"))
    meta = {
        "backend": "local",
        "model": model_name,
        "seed": reply.get("seed"),
        "steps": steps,
        "guidance": guidance,
        "size": [width, height],
        "saved_path": str(target),
    }
    result = image_store.result_from_file(
        target,
        meta,
        latency_ms,
        {"url": f"mflux:{model_path}", "payload": payload},
        {
            "model_path": model_path,
            "bits": bits,
            "family": _state["family"],
            "worker_ms": reply.get("generation_ms"),
        },
    )
    global _last_run
    # Without the base64 copy: the browser fetches the PNG through
    # /api/image-test/file/{name}, which is the same file on disk.
    _last_run = {key: value for key, value in result.items() if key != "image_b64"}
    _last_run["finished_at"] = _now()
    return result


def shutdown() -> None:
    """Called when roz stops: never leave a 22 GB child behind."""
    _bridge.stop()
    _set(state="idle", **_IDLE)
