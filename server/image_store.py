"""Image lab storage: decode the reply, write the PNG, describe the result.

Split from ``image_test`` because the response side is the bulky half and it has
its own contract: every byte the generator returns ends up on disk losslessly,
and the browser downloads that same file instead of a re-encode.
"""

from __future__ import annotations

import base64
import binascii
import json
import os
import re
import unicodedata
from datetime import datetime
from pathlib import Path


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def out_dir() -> Path:
    """Where the PNGs land. Relative paths resolve against the repository root,
    so the service can be started from anywhere."""
    raw = _env("ROZ_IMAGE_TEST_OUT") or "artifacts/images"
    path = Path(raw)
    if not path.is_absolute():
        path = Path(__file__).resolve().parent.parent / path
    return path


class UpstreamError(RuntimeError):
    """The generator rejected the request or the transport failed."""


def _decode_image(raw: object) -> bytes:
    """Base64 (optionally a data: URL) to bytes. Anything else is a hard error."""
    text = str(raw or "").strip()
    if not text:
        raise UpstreamError("upstream returned an empty image")
    if text.startswith("data:"):
        text = text.partition(",")[2]
    try:
        return base64.b64decode(text, validate=False)
    except (binascii.Error, ValueError) as exc:
        raise UpstreamError(f"image is not valid base64: {exc}") from exc


def _first_image(body: dict, backend: str) -> bytes:
    if backend == "a1111":
        images = body.get("images") or []
        if not images:
            raise UpstreamError("upstream returned no images")
        return _decode_image(images[0])
    data = body.get("data") or []
    if not data:
        raise UpstreamError("upstream returned no data")
    entry = data[0] if isinstance(data[0], dict) else {}
    if entry.get("b64_json"):
        return _decode_image(entry["b64_json"])
    raise UpstreamError("upstream answered with a URL, not a base64 image (ask for b64_json)")


def _slug(text: str, limit: int = 40) -> str:
    # NFKD first: without it 'Ñandú' loses two letters instead of its accents and
    # a Spanish prompt produces a shorter filename than the one it describes.
    decomposed = unicodedata.normalize("NFKD", text)
    ascii_text = decomposed.encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text).strip("-").lower()
    return slug[:limit].rstrip("-") or "image"


def save_image(data: bytes, subject: str) -> Path:
    """PNG bytes on disk, lossless, timestamped. This is the high-definition copy:
    the browser preview is the same file, never a re-encode."""
    path = target_path(subject)
    path.write_bytes(data)
    return path


def target_path(subject: str) -> Path:
    """Where the next PNG goes. Split out because the local mflux worker writes
    the file itself and roz still owns the name."""
    target = out_dir()
    target.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return target / f"{stamp}-{_slug(subject)}.png"


def result_from_file(
    path: Path, meta: dict, latency_ms: int, request: dict, raw: dict
) -> dict:
    """The run shape the UI consumes, built from a PNG already on disk."""
    data = path.read_bytes()
    return {
        "image_b64": base64.b64encode(data).decode("ascii"),
        "image_name": path.name,
        "image_bytes": len(data),
        "meta": meta,
        "latency_ms": latency_ms,
        "request": request,
        "raw": raw,
    }


def normalise(
    body: dict, backend: str, latency_ms: int, url: str, payload: dict, subject: str
) -> dict:
    image = _first_image(body, backend)
    if not image:
        raise UpstreamError("upstream returned an empty image")
    path = save_image(image, subject or str(payload.get("prompt") or ""))
    info = body.get("info")
    if isinstance(info, str):
        try:
            info = json.loads(info)
        except ValueError:
            info = {"raw": info[:400]}
    return {
        "image_b64": base64.b64encode(image).decode("ascii"),
        "image_name": path.name,
        "image_bytes": len(image),
        "meta": {
            "backend": backend,
            "model": body.get("model") or payload.get("model") or None,
            "seed": (info or {}).get("seed") if isinstance(info, dict) else None,
            "steps": payload.get("steps"),
            "guidance": payload.get("cfg_scale", payload.get("guidance_scale")),
            "size": [payload.get("width"), payload.get("height")],
            "saved_path": str(path),
        },
        "latency_ms": latency_ms,
        "request": {"url": url, "payload": payload},
        "raw": {k: v for k, v in body.items() if k not in ("images", "data")},
    }
