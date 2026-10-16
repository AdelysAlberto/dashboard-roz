"""HTTP surface for the service registry (see ``server/services.py``)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from server import services, services_actions, services_runtime

router = APIRouter(prefix="/api/services", tags=["services"])


@router.get("")
def list_services():
    return {"root": str(services.services_root()), "services": services_runtime.snapshot()}


@router.get("/docs")
def get_service_docs(id: str):
    try:
        return services.read_docs(id)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


class ActionIn(BaseModel):
    service_id: str
    unit_id: str | None = None
    op: str | None = None
    action_id: str | None = None


@router.post("/action")
def post_action(body: ActionIn):
    try:
        return services_actions.run_action(
            body.service_id, body.unit_id, body.op, body.action_id
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
