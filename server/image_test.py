"""Image lab: build, preview and send one text-to-image request.

Two upstream shapes are supported, because the local options disagree:

- ``a1111`` — ``POST {base}/sdapi/v1/txt2img`` (Draw Things, and any Automatic1111
  compatible wrapper). Body: prompt, negative_prompt, width, height, steps,
  cfg_scale, seed, sampler_name.
- ``openai`` — ``POST {base}/v1/images/generations``. Body: model, prompt, size,
  response_format=b64_json.

Roz owns the envelope here too: the master prompt is prepended and the chosen
orientation is appended as a framing line, so the preview shows exactly the text
the model receives. Endpoint, model and key resolve from ``ROZ_IMAGE_TEST_*``.
"""

from __future__ import annotations

import os
import time
from typing import Any

import httpx

from server.image_store import UpstreamError, normalise, out_dir, save_image
from server.image_test_prompt import IMAGE_MASTER_PROMPT, ORIENTATION_LINES

# Qwen-Image model card resolutions. Anything else drifts off the trained
# bucket sizes and costs quality.
SIZES: dict[str, tuple[int, int]] = {
    "1:1": (1328, 1328),
    "16:9": (1664, 928),
    "9:16": (928, 1664),
}
DEFAULT_STEPS = 50
DEFAULT_GUIDANCE = 4.0
BACKENDS = ("auto", "a1111", "openai")


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def defaults() -> dict:
    return {
        "api_url": _env("ROZ_IMAGE_TEST_URL"),
        "model": _env("ROZ_IMAGE_TEST_MODEL"),
        "backend": _env("ROZ_IMAGE_TEST_BACKEND", "auto") or "auto",
        "has_key": bool(_env("ROZ_IMAGE_TEST_KEY")),
        "steps": int(_env("ROZ_IMAGE_TEST_STEPS", str(DEFAULT_STEPS)) or DEFAULT_STEPS),
        "guidance": float(_env("ROZ_IMAGE_TEST_GUIDANCE", str(DEFAULT_GUIDANCE)) or DEFAULT_GUIDANCE),
        "orientation": _env("ROZ_IMAGE_TEST_ORIENTATION", "1:1") or "1:1",
        "master_prompt": IMAGE_MASTER_PROMPT,
        "timeout": float(_env("ROZ_IMAGE_TEST_TIMEOUT", "600") or 600),
        "out_dir": str(out_dir()),
    }


# ── sizes and backend ──────────────────────────────────────────────────

def size_for(orientation: object) -> tuple[int, int]:
    key = str(orientation or "").strip()
    if key not in SIZES:
        raise ValueError(f"unknown orientation {key!r}: use one of {', '.join(SIZES)}")
    return SIZES[key]


def resolve_backend(raw: object, url: str) -> str:
    """`auto` reads the URL: an sdapi path or a bare host means Automatic1111."""
    choice = str(raw or "auto").strip().lower()
    if choice not in BACKENDS:
        raise ValueError(f"unknown backend {choice!r}: use one of {', '.join(BACKENDS)}")
    if choice != "auto":
        return choice
    clean = url.rstrip("/").lower()
    if "sdapi" in clean or clean.endswith("/v1/images/generations"):
        return "a1111" if "sdapi" in clean else "openai"
    return "a1111"


def resolve_url(raw: str, backend: str) -> str:
    url = (raw or "").strip()
    if not url:
        raise ValueError("API URL is empty: set ROZ_IMAGE_TEST_URL or type one")
    if not url.startswith(("http://", "https://")):
        raise ValueError("API URL must start with http:// or https://")
    clean = url.rstrip("/")
    if backend == "a1111":
        return clean if clean.endswith("/sdapi/v1/txt2img") else f"{clean}/sdapi/v1/txt2img"
    return clean if clean.endswith("/images/generations") else f"{clean}/images/generations"


# ── request building ───────────────────────────────────────────────────

def build_prompt(spec: dict) -> str:
    """Master instructions + subject + framing line. One string, in this order."""
    master = str(spec.get("master_prompt") or "").strip()
    subject = str(spec.get("user_prompt") or "").strip()
    if not subject:
        raise ValueError("the prompt is empty: describe the image you want")
    orientation = str(spec.get("orientation") or "1:1").strip()
    framing = ORIENTATION_LINES.get(orientation)
    if framing is None:
        raise ValueError(f"unknown orientation {orientation!r}")
    return "\n\n".join(part for part in (master, subject, framing) if part)


def _int_or(value: object, fallback: int) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return fallback


def _float_or(value: object, fallback: float) -> float:
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return fallback


def build_payload(spec: dict, backend: str) -> dict[str, Any]:
    width, height = size_for(spec.get("orientation"))
    prompt = build_prompt(spec)
    steps = max(1, min(100, _int_or(spec.get("steps"), DEFAULT_STEPS)))
    guidance = max(0.0, min(20.0, _float_or(spec.get("guidance"), DEFAULT_GUIDANCE)))
    seed = _int_or(spec.get("seed"), -1)
    seed = seed if seed >= 0 else -1
    if backend == "openai":
        payload: dict[str, Any] = {
            "model": str(spec.get("model") or "").strip(),
            "prompt": prompt,
            "n": 1,
            "size": f"{width}x{height}",
            "response_format": "b64_json",
        }
        # Local OpenAI-compatible image servers accept these as extras; servers
        # that do not know them ignore them, which is cheaper than a 422.
        payload["steps"] = steps
        payload["guidance_scale"] = guidance
        if seed >= 0:
            payload["seed"] = seed
        return payload
    payload = {
        "prompt": prompt,
        "negative_prompt": str(spec.get("negative_prompt") or "").strip(),
        "width": width,
        "height": height,
        "steps": steps,
        "cfg_scale": guidance,
        "seed": seed,
        "batch_size": 1,
        "n_iter": 1,
    }
    return payload


def preview(spec: dict) -> dict:
    url_raw = str(spec.get("api_url") or "")
    backend = resolve_backend(spec.get("backend"), url_raw)
    return {
        "url": resolve_url(url_raw, backend),
        "backend": backend,
        "payload": build_payload(spec, backend),
        "size": list(size_for(spec.get("orientation"))),
    }


# ── transport ──────────────────────────────────────────────────────────

def _api_key(spec: dict) -> str:
    return str(spec.get("api_key") or "").strip() or _env("ROZ_IMAGE_TEST_KEY")


def send(spec: dict) -> dict:
    url_raw = str(spec.get("api_url") or "")
    backend = resolve_backend(spec.get("backend"), url_raw)
    url = resolve_url(url_raw, backend)
    payload = build_payload(spec, backend)
    if backend == "openai" and not payload["model"]:
        raise ValueError("model is empty: set ROZ_IMAGE_TEST_MODEL or type one")

    headers = {"Content-Type": "application/json"}
    key = _api_key(spec)
    if key:
        headers["Authorization"] = f"Bearer {key}"

    timeout = float(_env("ROZ_IMAGE_TEST_TIMEOUT", "600") or 600)
    started = time.perf_counter()
    try:
        with httpx.Client(timeout=httpx.Timeout(timeout, connect=15.0)) as client:
            response = client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise UpstreamError(f"{type(exc).__name__}: {exc}") from exc
    latency_ms = int((time.perf_counter() - started) * 1000)

    if response.status_code >= 400:
        raise UpstreamError(f"upstream {response.status_code}: {response.text[:600]}")
    try:
        body = response.json()
    except ValueError as exc:
        raise UpstreamError(f"upstream sent non-JSON: {response.text[:300]}") from exc
    if not isinstance(body, dict):
        raise UpstreamError("upstream sent an unexpected shape (not an object)")

    return normalise(body, backend, latency_ms, url, payload, str(spec.get("user_prompt") or ""))


