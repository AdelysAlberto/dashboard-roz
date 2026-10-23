"""HTTP surface for the Test Imagen tab.

Same contract as the prompt lab: no persistence, endpoint and key from the
environment with a per-run override, and ``/preview`` so the prompt Roz builds
(master + subject + framing line) can be audited before spending a generation.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from server import image_test

router = APIRouter(prefix="/api/image-test", tags=["image-test"])


class GenerateIn(BaseModel):
    api_url: str = ""
    api_key: str = ""
    backend: str = "auto"
    model: str = ""
    steps: int = image_test.DEFAULT_STEPS
    guidance: float = image_test.DEFAULT_GUIDANCE
    seed: str = ""
    orientation: str = "1:1"
    negative_prompt: str = ""
    master_prompt: str = ""
    user_prompt: str = ""


@router.get("/defaults")
def get_defaults():
    return image_test.defaults()


@router.post("/preview")
def post_preview(body: GenerateIn):
    try:
        return image_test.preview(body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/generate")
def post_generate(body: GenerateIn):
    try:
        return image_test.send(body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except image_test.UpstreamError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/file/{name}")
def get_file(name: str):
    """Serve a saved PNG for the 'save the original' button.

    ``name`` is a single path segment and is resolved inside the output
    directory only, so a crafted name cannot walk out of it.
    """
    base = image_test.out_dir().resolve()
    if "/" in name or "\\" in name or name in ("", ".", ".."):
        raise HTTPException(400, "invalid file name")
    path = (base / name).resolve()
    if base not in path.parents:
        raise HTTPException(400, "invalid file name")
    if not path.is_file():
        raise HTTPException(404, "no such image")
    return FileResponse(path, media_type="image/png", filename=path.name)
