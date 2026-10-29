"""HTTP surface for the local mflux backend of the Test Imagen tab.

Same lab, no HTTP hop: roz spawns one resident worker that holds the checkpoint
and generates in-process. The routes split state from action on purpose — the
form asks for ``/status`` while the model loads, so ``/load`` has to answer
before the weights are resident.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from server import mflux_local, mflux_models
from server.image_test_api import GenerateIn
from server.mflux_bridge import WorkerError

router = APIRouter(prefix="/api/image-test/local", tags=["image-test-local"])


class LoadIn(BaseModel):
    """Empty means "the checkpoint configured in .env"."""

    path: str = ""


class LocalGenerateIn(GenerateIn):
    """The folder is only a hint: the worker generates with whatever is loaded,
    and the status is what the form gates the button on."""

    model_path: str = ""


@router.get("/status")
def get_status():
    return mflux_local.status()


@router.get("/models")
def get_models():
    return {
        "root": str(mflux_models.models_root()),
        "models": mflux_models.list_models(),
        "python": mflux_models.python_for_mflux(),
        "available": mflux_models.mflux_available(),
        "default_path": mflux_models.default_model_path(),
    }


@router.post("/load")
def post_load(body: LoadIn):
    try:
        return mflux_local.load(body.path)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except mflux_local.NotReady as exc:
        raise HTTPException(409, str(exc)) from exc
    except WorkerError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.post("/unload")
def post_unload():
    try:
        return mflux_local.unload()
    except mflux_local.NotReady as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/generate")
def post_generate(body: LocalGenerateIn):
    try:
        return mflux_local.generate(body.model_dump())
    except mflux_local.NotReady as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except WorkerError as exc:
        raise HTTPException(502, str(exc)) from exc
