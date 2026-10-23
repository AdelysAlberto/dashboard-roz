"""HTTP surface for the Test IA tab: the prompt lab.

Three routes, no persistence: the form's draft lives in the browser, the
endpoint and key come from the environment and the operator may override them
per run. ``/preview`` exists so the envelope Roz wraps around the prompts can be
audited before spending a model call.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from server import llm_test

router = APIRouter(prefix="/api/llm-test", tags=["llm-test"])


class ContextIn(BaseModel):
    latitude: str = ""
    longitude: str = ""
    vehicle: str = ""
    avoid_highways: bool = False
    avoid_tolls: bool = False
    prefer_curves: bool = False


class RunIn(BaseModel):
    api_url: str = ""
    api_key: str = ""
    model: str = ""
    temperature: float = 0.2
    max_tokens: int | None = None
    master_prompt: str = ""
    user_prompt: str = ""
    thinking: str = "default"
    reasoning_effort: str = ""
    thinking_budget: str = ""
    context: ContextIn = ContextIn()


@router.get("/defaults")
def get_defaults():
    return llm_test.defaults()


@router.post("/preview")
def post_preview(body: RunIn):
    try:
        return llm_test.preview(body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/run")
def post_run(body: RunIn):
    try:
        return llm_test.send(body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except llm_test.UpstreamError as exc:
        raise HTTPException(502, str(exc)) from exc
