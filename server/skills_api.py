"""HTTP surface for the Skills tab: scan, read, tag, analyze, chat, deep dive.

Analysis and chat stream as Server-Sent Events (``text/event-stream``) because
a full SKILL.md analysis takes tens of seconds: the browser renders tokens as
they arrive instead of waiting behind a spinner.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from server import pilot, skills_index, skills_llm, skills_scan, skills_taxonomy

router = APIRouter(prefix="/api/skills", tags=["skills"])

DEEP_DIVE_PROMPT = """Investiga el skill de agente `{name}` y explicámelo como si nunca lo hubiera usado.

Archivo: {file}

Leé el SKILL.md completo con tus herramientas y su carpeta (`ls` de los archivos que lo acompañan).
Después respondé en español, en lenguaje llano, con este formato:

QUÉ ES: <2 frases>
CUÁNDO USARLO: <3 viñetas de disparadores concretos>
QUÉ ME AHORRA: <2 viñetas>
CÓMO SE INVOCA: <comando o instrucción exacta>
COMPARACIÓN: <con qué skills vecinos se confunde y en qué se diferencian>
RIESGO: <qué puede salir mal o qué hay que revisar antes de confiar en él>

Si el documento no alcanza para responder algo, decilo explícitamente. No modifiques ningún archivo."""


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _skill_or_404(skill_id: str) -> dict:
    skill = skills_scan.find(skill_id)
    if skill is None:
        raise HTTPException(404, f"unknown skill: {skill_id}")
    return skill


@router.get("")
def snapshot():
    merged = [skills_index.merge(skill) for skill in skills_scan.scan()]
    known = {skill["id"] for skill in merged}
    counts: dict[str, int] = {}
    for skill in merged:
        counts[skill["category"]] = counts.get(skill["category"], 0) + 1
    groups = [
        {"category": key, "label": skills_taxonomy.LABELS[key], "count": counts.get(key, 0)}
        for key in skills_taxonomy.CATEGORY_KEYS
        if counts.get(key)
    ]
    orphans = [k for k in skills_index.load()["skills"] if k not in known]
    return {
        "skills": [skills_scan.public(skill) for skill in merged],
        "groups": groups,
        "roots": skills_scan.root_status(),
        "orphans": orphans,
        "llm": {
            "configured": skills_llm.configured(),
            "model": skills_llm.config()["model"],
        },
    }


@router.get("/detail")
def detail(id: str):
    skill = _skill_or_404(id)
    merged = skills_index.merge(skill)
    return {
        "skill": skills_scan.public(merged),
        "content": skills_scan.read_content(skill),
        "files": merged["files"],
    }


class TagsIn(BaseModel):
    id: str
    category: str | None = None
    tags: list[str] | None = None


@router.post("/tags")
def set_tags(body: TagsIn):
    _skill_or_404(body.id)
    patch: dict = {}
    if body.category is not None:
        category = body.category.strip().lower()
        if category not in skills_taxonomy.CATEGORY_KEYS:
            raise HTTPException(400, f"unknown category: {category}")
        patch["category"] = category
        patch["category_source"] = "manual"
    if body.tags is not None:
        patch["tags"] = [t.strip().lower() for t in body.tags if t.strip()][:8]
    return {"entry": skills_index.update(body.id, patch)}


class AnalyzeIn(BaseModel):
    id: str
    force: bool = False


@router.post("/analyze")
def analyze(body: AnalyzeIn) -> StreamingResponse:
    skill = _skill_or_404(body.id)
    if not skills_llm.configured():
        raise HTTPException(400, "ROZ_LLM_BASE_URL / ROZ_LLM_MODEL are not configured")
    current = skills_index.entry(skill["id"])
    cached = (
        current.get("analysis")
        and current.get("content_hash") == skill["content_hash"]
        and not body.force
    )
    return StreamingResponse(
        _analyze_stream(skill, current, bool(cached)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _analyze_stream(skill: dict, current: dict, cached: bool) -> AsyncIterator[str]:
    if cached:
        yield _sse({
            "type": "done",
            "cached": True,
            "analysis": current.get("analysis", ""),
            "summary_es": current.get("summary_es", ""),
            "category": current.get("category", ""),
            "tags": current.get("tags", []),
        })
        return

    cfg = skills_llm.config()
    yield _sse({"type": "start", "model": cfg["model"]})
    content = skills_scan.read_content(skill)
    messages = skills_llm.analysis_messages(skill, content)
    chunks: list[str] = []
    try:
        async for delta in skills_llm.stream_chat(messages):
            chunks.append(delta)
            yield _sse({"type": "delta", "text": delta})
    except skills_llm.LLMError as e:
        yield _sse({"type": "error", "message": str(e)})
        return

    parsed = skills_llm.parse_analysis("".join(chunks))
    patch = {
        "analysis": parsed["body"],
        "analyzed_at": _now(),
        "model": cfg["model"],
        "content_hash": skill["content_hash"],
    }
    if parsed["tags"]:
        patch["tags"] = parsed["tags"]
    if parsed["summary"]:
        patch["summary_es"] = parsed["summary"]
    if parsed["category"] in skills_taxonomy.CATEGORY_KEYS:
        patch["category"] = parsed["category"]
        patch["category_source"] = "analysis"
    skills_index.update(skill["id"], patch)
    yield _sse({
        "type": "done",
        "cached": False,
        "analysis": parsed["body"],
        "summary_es": parsed.get("summary", ""),
        "category": patch.get("category", ""),
        "tags": patch.get("tags", []),
    })


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatIn(BaseModel):
    id: str
    messages: list[ChatMessage]


@router.post("/chat")
def chat(body: ChatIn) -> StreamingResponse:
    skill = _skill_or_404(body.id)
    if not skills_llm.configured():
        raise HTTPException(400, "ROZ_LLM_BASE_URL / ROZ_LLM_MODEL are not configured")
    history = [m.model_dump() for m in body.messages]
    return StreamingResponse(
        _chat_stream(skill, history),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _chat_stream(skill: dict, history: list[dict]) -> AsyncIterator[str]:
    merged = skills_index.merge(skill)
    messages = skills_llm.chat_messages(
        skill,
        skills_scan.read_content(skill),
        merged.get("analysis", ""),
        history,
    )
    yield _sse({"type": "start", "model": skills_llm.config()["model"]})
    try:
        async for delta in skills_llm.stream_chat(messages):
            yield _sse({"type": "delta", "text": delta})
    except skills_llm.LLMError as e:
        yield _sse({"type": "error", "message": str(e)})
        return
    yield _sse({"type": "done"})


class DeepDiveIn(BaseModel):
    id: str
    # No agent by default: the installed pi (1.3.x) has no --agent flag, so any
    # value here would make the run exit on argv parsing. The prompt already
    # frames the role.
    agent: str | None = None


@router.post("/deepdive")
async def deep_dive(body: DeepDiveIn):
    """Reuse the pi pilot (real tools: web_search, GitHub, shell) for sourcing."""
    skill = _skill_or_404(body.id)
    prompt = DEEP_DIVE_PROMPT.format(name=skill["name"], file=skill["path"])
    agent = None if body.agent in (None, "", "none") else body.agent
    run = await pilot.registry.create(prompt, agent, skill["path"])
    return {"run_id": run.run_id, "path": skill["path"]}
