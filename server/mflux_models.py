"""Local mflux checkpoints: which folders this machine can run, and with what.

Discovery never imports mlx. Pointing the worker at a chat-model folder has to
fail in milliseconds, not after 22 GB of weights have been paged in, so the shape
of the directory and the README are the whole test.

Two Qwen-Image families exist and they do not share a directory layout, because
they do not share a text encoder:

- ``qwen-image`` (2512, 2511, edit) — ``transformer/ vae/ text_encoder/ tokenizer/``
- ``qwen-image-2.1`` — ``transformer/ vae/ text_encoder/ processor/`` (Qwen3-VL)

The family is not cosmetic: mflux loads each one with a different class and a
different model config, so the worker is told which family the folder is.
Anything else is reported as incompatible together with the reason, which the
form shows instead of a generic failure.
"""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT_ROOT = "/Volumes/Datos/OllamaModels/oMLX/mlx-community"
DEFAULT_MODEL = "Qwen-Image-2512-3bit"
DEFAULT_PYTHON = "~/.venvs/mflux/bin/python"

# Component trees per family. Missing one of these is not a quantization
# difference, it is another kind of model (or another family).
CONTAINER_PARTS = ("transformer", "vae", "text_encoder")
FAMILY_PARTS: dict[str, str] = {
    "qwen-image": "tokenizer",
    "qwen-image-2.1": "processor",
}

# Checked in order: 2.1 before the generic marker, because every 2.1 checkpoint
# also mentions "Qwen-Image".
FAMILY_MARKERS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("qwen-image-2.1", ("qwen-image-2.1", "qwen-image-21", "qwen/image-2.1", "qwen/qwen-image-2.1")),
    ("qwen-image", ("qwen-image", "qwen/qwen-image")),
)


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def models_root() -> Path:
    return Path(_env("ROZ_IMAGE_TEST_MODELS_DIR", DEFAULT_ROOT)).expanduser()


def default_model_path() -> str:
    """The 3-bit checkpoint: smallest of the two on this machine, so it is the
    one that loads when nobody picks another."""
    return _env("ROZ_IMAGE_TEST_LOCAL_MODEL", str(models_root() / DEFAULT_MODEL))


def python_for_mflux() -> str:
    """Interpreter that has mflux installed. Roz itself never imports mlx."""
    return str(Path(_env("ROZ_MFLUX_PYTHON", DEFAULT_PYTHON)).expanduser())


def mflux_available() -> bool:
    """Cheap check: the interpreter exists and can be executed. Proving that it
    imports mflux would cost a subprocess per form render."""
    path = python_for_mflux()
    return bool(path) and os.access(path, os.X_OK)


def _dir_size(path: Path) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += (Path(root) / name).stat().st_size
            except OSError:
                continue
    return total


def _family(path: Path, name: str) -> str | None:
    haystack = name.lower()
    readme = path / "README.md"
    if readme.is_file():
        try:
            haystack += readme.read_text(encoding="utf-8", errors="ignore").lower()
        except OSError:
            pass
    for family, markers in FAMILY_MARKERS:
        if any(marker in haystack for marker in markers):
            return family
    return None


def inspect_model(raw_path: str) -> dict:
    """Describe one folder. Never raises for an incompatible model: the caller
    needs the reason to show it, not an exception to swallow."""
    text = str(raw_path or "").strip()
    if not text:
        raise ValueError("model path is empty")
    path = Path(text).expanduser()
    if not path.is_dir():
        raise ValueError(f"not a directory: {path}")

    resolved = path.resolve()
    name = resolved.name
    family = _family(resolved, name)
    parts = CONTAINER_PARTS + (FAMILY_PARTS[family],) if family else ()
    missing = [part for part in parts if not (resolved / part).is_dir()]
    if family is None:
        reason = "not a Qwen-Image checkpoint: neither the folder name nor the README mentions it"
    elif missing:
        reason = f"missing {', '.join(part + '/' for part in missing)}"
    else:
        reason = ""
    return {
        "path": str(resolved),
        "name": name,
        "compatible": not reason,
        "reason": reason,
        "size_bytes": _dir_size(resolved),
        "family": family,
        "default": str(resolved) == _default_resolved(),
    }


def _default_resolved() -> str:
    candidate = Path(default_model_path()).expanduser()
    return str(candidate.resolve()) if candidate.is_dir() else ""


def list_models() -> list[dict]:
    """Every folder under the models root, compatible ones first.

    Only one level deep: Hugging Face snapshots nest the real weights one level
    further down, and those are not what the operator points at.
    """
    root = models_root()
    if not root.is_dir():
        return []
    found: list[dict] = []
    for child in sorted(root.iterdir(), key=lambda entry: entry.name.lower()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        try:
            found.append(inspect_model(str(child)))
        except ValueError:
            continue
    found.sort(key=lambda item: (not item["compatible"], item["name"].lower()))
    return found
