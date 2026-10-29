"""Resident mflux worker: one process, one Qwen-Image checkpoint, JSON lines.

Roz never imports mlx. A 20B diffusion model inside the web server would take
22 GB it cannot give back, so the mlx side lives in this script, launched with
the interpreter that has mflux (``ROZ_MFLUX_PYTHON``). The parent keeps the state
and this process keeps the weights.

One JSON object per line, requests and replies share an ``id``:

    {"op": "load", "id": "1", "path": "/abs/dir", "warmup": true}
        -> {"type": "status", "id": "1", "phase": "loading"}
        -> {"type": "ready", "id": "1", "load_ms": 42000, "bits": 3, "warmup": true}
    {"op": "generate", "id": "2", "prompt": "…", "width": 1328, "height": 1328,
     "steps": 20, "guidance": 4.0, "seed": 42, "negative_prompt": "",
     "out_path": "/abs/file.png"}
        -> {"type": "result", "id": "2", "path": "…", "bytes": 1843992, "seed": 42}
    {"op": "ping", "id": "3"}  -> {"type": "pong", "id": "3"}
    {"op": "shutdown", "id": "4"} -> {"type": "bye", "id": "4"}, then exit

Every failure answers ``{"type": "error", "id": …, "message": …}`` and the loop
stays alive: a rejected prompt must not cost another 22 GB load.

The protocol owns fd 1 and pushes the standard streams to fd 2, because tqdm and
the library's own prints would otherwise land in the middle of a JSON line.
"""

from __future__ import annotations

import json
import os
import random
import sys
import time
import traceback
from typing import TextIO

# Smallest size that still exercises every block of the denoiser. A warmup is
# what turns "constructed" into "weights are resident": mlx materialises lazily,
# so without it the first real step pays the load and the status would be a lie.
WARMUP_SIZE = 512
WARMUP_STEPS = 1

# mflux loads each Qwen-Image family with its own class and model config. The
# folders differ too (``tokenizer`` for 2512, ``processor`` for 2.1), which is why
# the family travels with the load request instead of being guessed here.
FAMILIES: dict[str, tuple[str, str, str]] = {
    "qwen-image": (
        "mflux.models.qwen.variants.txt2img.qwen_image",
        "QwenImage",
        "qwen_image",
    ),
    "qwen-image-2.1": (
        "mflux.models.qwen21.variants.txt2img.qwen_image_21",
        "QwenImage21",
        "qwen_image_21",
    ),
}


def _protocol() -> TextIO:
    channel = os.fdopen(os.dup(sys.stdout.fileno()), "w", buffering=1, encoding="utf-8")
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    sys.stdout = sys.stderr
    return channel


CHANNEL = _protocol()


def emit(payload: dict) -> None:
    CHANNEL.write(json.dumps(payload, ensure_ascii=False) + "\n")
    CHANNEL.flush()


class Failure(RuntimeError):
    """A request the worker refuses; reported, never fatal for the process."""


class Worker:
    def __init__(self) -> None:
        self.model = None
        self.path: str | None = None
        self.family: str | None = None
        self.bits: int | None = None

    # ── load ───────────────────────────────────────────────────────────
    def _build(self, family: str, path: str):
        import importlib

        if family not in FAMILIES:
            raise Failure(f"unknown family {family!r}: use one of {', '.join(FAMILIES)}")
        module_name, class_name, config_factory = FAMILIES[family]
        module = importlib.import_module(module_name)
        from mflux.models.common.config.model_config import ModelConfig

        cls = getattr(module, class_name)
        config = getattr(ModelConfig, config_factory)()
        return cls(model_config=config, model_path=path)

    def load(self, request: dict) -> None:
        request_id = request.get("id")
        path = str(request.get("path") or "").strip()
        family = str(request.get("family") or "qwen-image").strip()
        if not path or not os.path.isdir(path):
            raise Failure(f"not a directory: {path or '(empty)'}")

        emit({"type": "status", "id": request_id, "phase": "loading"})
        started = time.perf_counter()
        self.model = self._build(family, path)
        self.path = path
        self.family = family
        self.bits = getattr(self.model, "bits", None)
        load_ms = int((time.perf_counter() - started) * 1000)

        warmup: bool | None = None
        warmup_ms: int | None = None
        if request.get("warmup", True):
            emit({"type": "status", "id": request_id, "phase": "warmup"})
            began = time.perf_counter()
            try:
                self.model.generate_image(
                    seed=1,
                    prompt="warmup",
                    num_inference_steps=WARMUP_STEPS,
                    width=WARMUP_SIZE,
                    height=WARMUP_SIZE,
                    guidance=4.0,
                )
                warmup = True
            except Exception as exc:  # noqa: BLE001 - a failed warmup is a warning, not a dead worker
                warmup = False
                emit(
                    {
                        "type": "warning",
                        "id": request_id,
                        "message": f"warmup failed, weights stay lazy: {type(exc).__name__}: {exc}",
                    }
                )
            warmup_ms = int((time.perf_counter() - began) * 1000)

        emit(
            {
                "type": "ready",
                "id": request_id,
                "load_ms": load_ms,
                "warmup": warmup,
                "warmup_ms": warmup_ms,
                "bits": self.bits,
                "family": family,
            }
        )

    # ── generate ───────────────────────────────────────────────────────
    def generate(self, request: dict) -> None:
        if self.model is None:
            raise Failure("no model loaded")
        out_path = str(request.get("out_path") or "").strip()
        if not out_path:
            raise Failure("out_path is empty")
        prompt = str(request.get("prompt") or "").strip()
        if not prompt:
            raise Failure("the prompt is empty")

        seed = request.get("seed")
        seed = int(seed) if isinstance(seed, (int, float)) and int(seed) >= 0 else random.randrange(2**31 - 1)
        started = time.perf_counter()
        image = self.model.generate_image(
            seed=seed,
            prompt=prompt,
            negative_prompt=str(request.get("negative_prompt") or "").strip() or None,
            num_inference_steps=int(request.get("steps") or 20),
            width=int(request.get("width") or 1328),
            height=int(request.get("height") or 1328),
            guidance=float(request.get("guidance") or 4.0),
        )
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        image.image.save(out_path, format="PNG")
        emit(
            {
                "type": "result",
                "id": request.get("id"),
                "path": out_path,
                "bytes": os.path.getsize(out_path),
                "seed": seed,
                "steps": int(request.get("steps") or 20),
                "generation_ms": elapsed_ms,
                "reported_ms": int(float(getattr(image, "generation_time", 0.0)) * 1000),
            }
        )


def main() -> int:
    worker = Worker()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except ValueError:
            emit({"type": "error", "id": None, "message": "request is not JSON"})
            continue
        if not isinstance(request, dict):
            emit({"type": "error", "id": None, "message": "request is not an object"})
            continue
        op = str(request.get("op") or "")
        request_id = request.get("id")
        try:
            if op == "load":
                worker.load(request)
            elif op == "generate":
                worker.generate(request)
            elif op == "ping":
                emit({"type": "pong", "id": request_id})
            elif op == "shutdown":
                emit({"type": "bye", "id": request_id})
                return 0
            else:
                raise Failure(f"unknown op {op!r}")
        except Failure as exc:
            emit({"type": "error", "id": request_id, "message": str(exc)})
        except Exception as exc:  # noqa: BLE001 - one bad request must not end the session
            traceback.print_exc()
            emit({"type": "error", "id": request_id, "message": f"{type(exc).__name__}: {exc}"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
