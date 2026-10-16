"""HTTP surface for the engine adapters (oMLX, Ollama, Splash).

Una ruta por operación, y el adapter del motor decide si la soporta (si no, 400 con motivo).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from server import engines
from server.engines.base import task_list

router = APIRouter(prefix="/api/engines", tags=["engines"])


def _run(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.get("/tasks")
def list_tasks():
    """Tareas en curso (pulls de Ollama). Las descargas de oMLX se leen de su propia API."""
    return {"tasks": task_list()}


@router.get("/{service_id}/models")
def get_models(service_id: str):
    data = _run(engines.call, service_id, "models")
    if engines.engine_of(service_id) == "ollama":
        data["loaded"] = _run(engines.call, service_id, "running").get("loaded", [])
    return data


class ModelActionIn(BaseModel):
    model_id: str
    op: str = Field(pattern="^(load|unload|delete)$")


@router.post("/{service_id}/models/action")
def post_model_action(service_id: str, body: ModelActionIn):
    if body.op == "delete":
        return _run(engines.call, service_id, "delete", body.model_id)
    return _run(engines.call, service_id, "model_action", body.model_id, body.op)


class ModelSettingsIn(BaseModel):
    model_id: str
    patch: dict


@router.get("/{service_id}/models/{model_id}/settings")
def get_model_settings(service_id: str, model_id: str):
    return _run(engines.call, service_id, "model_settings", model_id)


@router.put("/{service_id}/models/{model_id}/settings")
def put_model_settings(service_id: str, model_id: str, body: ModelSettingsIn):
    return _run(engines.call, service_id, "update_model_settings", model_id, body.patch)


class SettingsIn(BaseModel):
    patch: dict


@router.get("/{service_id}/settings")
def get_settings(service_id: str):
    return _run(engines.call, service_id, "settings")


@router.post("/{service_id}/settings")
def post_settings(service_id: str, body: SettingsIn):
    return _run(engines.call, service_id, "update_settings", body.patch)


@router.get("/{service_id}/hf/search")
def hf_search(service_id: str, q: str, limit: int = 12):
    return _run(engines.call, service_id, "hf_search", q, limit)


class DownloadIn(BaseModel):
    repo_id: str


class PullIn(BaseModel):
    name: str


@router.post("/{service_id}/pull")
def pull_model(service_id: str, body: PullIn):
    """Descarga con progreso (Ollama: /api/pull en streaming → tarea consultable)."""
    return _run(engines.call, service_id, "pull", body.name)


@router.post("/{service_id}/hf/download")
def hf_download(service_id: str, body: DownloadIn):
    return _run(engines.call, service_id, "hf_download", body.repo_id)


@router.get("/{service_id}/tasks")
def engine_tasks(service_id: str):
    return _run(engines.call, service_id, "tasks")


@router.get("/{service_id}/metrics")
def metrics(service_id: str):
    return _run(engines.call, service_id, "metrics")


@router.get("/{service_id}/logs")
def logs(service_id: str, lines: int = 120):
    return _run(engines.call, service_id, "logs", lines)


@router.post("/{service_id}/restart")
def restart_engine(service_id: str):
    """Reinicio seguro del motor (oMLX: `omlx restart`, no el endpoint admin que deja el server caído)."""
    return _run(engines.call, service_id, "restart")


class LaunchIn(BaseModel):
    model: str
    args: list[str] = []


@router.post("/{service_id}/launch")
def launch_engine(service_id: str, body: LaunchIn):
    """Motores tipo lanzador (Splash): arranca con un modelo concreto."""
    return _run(engines.call, service_id, "launch", body.model, body.args)


# ── superficie Kokoro (voces: catálogo, prueba y default) ──────────────


@router.get("/{service_id}/voices")
def engine_voices(service_id: str):
    """Catálogo de voces + cuál es la por defecto (Kokoro)."""
    return _run(engines.call, service_id, "voices")


class SynthesizeIn(BaseModel):
    text: str = Field(min_length=1)
    voice: str = ""
    speed: float = Field(1.0, ge=0.5, le=2.0)
    format: str = Field("mp3", pattern="^(wav|mp3|opus|ogg|flac)$")


@router.post("/{service_id}/synthesize")
def engine_synthesize(service_id: str, body: SynthesizeIn):
    """Prueba de voz: sintetiza y devuelve audio base64 para reproducirlo en el modal."""
    return _run(engines.call, service_id, "synthesize", body.text, body.voice, body.speed, body.format)


class DefaultVoiceIn(BaseModel):
    voice: str = Field(min_length=1)


@router.post("/{service_id}/default-voice")
def engine_default_voice(service_id: str, body: DefaultVoiceIn):
    """Fija la voz por defecto del servicio (Kokoro la persiste en su .env)."""
    return _run(engines.call, service_id, "set_default", body.voice)


class ServerOpIn(BaseModel):
    op: str = Field(pattern="^(start|stop)$")


@router.post("/{service_id}/server")
def server_op(service_id: str, body: ServerOpIn):
    """Ciclo de vida del motor cuando lo gestiona otro supervisor (Ollama: launchd + app)."""
    return _run(engines.call, service_id, body.op)
