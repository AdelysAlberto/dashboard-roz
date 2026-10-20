"""OpenAI-compatible chat client for the Skills tab (default: dell3-heretic).

Endpoint, model and key come from the environment, never from code:
``ROZ_LLM_BASE_URL``, ``ROZ_LLM_API_KEY``, ``ROZ_LLM_MODEL``, ``ROZ_LLM_TIMEOUT``.

The client streams because the analysis of a large SKILL.md takes tens of
seconds: the UI shows the answer as it is written instead of a spinner.
"""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator

import httpx

ANALYST_SYSTEM = """Eres un analista senior de documentación técnica. Tu lector es un desarrollador \
que tiene 93 skills de agentes instalados y no sabe cuál usar, ni cuándo, ni para qué sirve cada uno.

Lees un SKILL.md (las instrucciones que recibe un agente de IA) y lo explicas en español neutro, \
en lenguaje llano, sin jerga innecesaria y sin repetir el documento palabra por palabra. Traduces \
documentación a utilidad: qué problema real evita, qué te ahorra, cuándo se te ocurre usarlo.

Reglas duras:
- Nada de relleno, marketing, emojis ni frases como "en el mundo actual".
- Si el documento no aclara algo, dilo ("no lo define"); nunca lo inventes.
- Cada sección: frases cortas, en segunda persona, concretas.
- Máximo 450 palabras en total."""

ANALYSIS_USER = """Analiza este skill.

id: {id}
origen: {source} · {rel_path}
archivos: {file_count} ({bytes} bytes en total)
nombre declarado: {name}
descripción declarada: {description}

--- INICIO SKILL.md ---
{content}
--- FIN SKILL.md ---

Responde EXACTAMENTE con este formato, sin nada antes ni después:

CATEGORY: <una sola clave de: design | ux | frontend | backend | quality | security | writing | product | legal | finance | media | meta>
TAGS: <3 a 6 etiquetas en minúsculas separadas por coma>
SUMMARY_ES: <una sola frase en español, máximo 160 caracteres, que diga qué hace el skill>
---
## Qué es
<2 o 3 frases: qué hace este skill, en llano>

## Cuándo lo usás
<3 o 4 viñetas con disparadores concretos: "cuando pides X", "si el repo tiene Y">

## Qué te resuelve
<2 o 3 viñetas: el problema real que evita o el trabajo que se ahorra>

## Cómo se usa
<2 o 3 viñetas: cómo se invoca o qué hace falta (si el documento no lo dice, escribí "no lo define")>

## Con qué no confundirlo
<1 o 2 frases comparándolo con los skills vecinos que el documento mencione; si no menciona ninguno, escribí "no menciona skills vecinos">

## Señal de que lo necesitás hoy
<una sola frase, un disparador>'"""


class LLMError(RuntimeError):
    """Upstream rejected the request or the transport failed."""


def config() -> dict:
    return {
        "base_url": os.environ.get("ROZ_LLM_BASE_URL", "").strip().rstrip("/"),
        "api_key": os.environ.get("ROZ_LLM_API_KEY", "").strip(),
        "model": os.environ.get("ROZ_LLM_MODEL", "").strip(),
        "timeout": float(os.environ.get("ROZ_LLM_TIMEOUT", "240") or 240),
        "max_chars": int(os.environ.get("ROZ_LLM_MAX_SKILL_CHARS", "120000") or 120000),
    }


def configured() -> bool:
    cfg = config()
    return bool(cfg["base_url"] and cfg["model"])


def _headers(cfg: dict) -> dict:
    headers = {"Content-Type": "application/json", "Accept": "text/event-stream"}
    if cfg["api_key"]:
        headers["Authorization"] = f"Bearer {cfg['api_key']}"
    return headers


async def stream_chat(messages: list[dict]) -> AsyncIterator[str]:
    """Yield content deltas from an OpenAI-compatible ``/chat/completions``."""
    cfg = config()
    if not cfg["base_url"] or not cfg["model"]:
        raise LLMError("ROZ_LLM_BASE_URL and ROZ_LLM_MODEL must be set in .env")
    payload = {
        "model": cfg["model"],
        "messages": messages,
        "stream": True,
        "temperature": 0.2,
    }
    timeout = httpx.Timeout(cfg["timeout"], connect=15.0)
    url = f"{cfg['base_url']}/chat/completions"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, json=payload, headers=_headers(cfg)) as resp:
                if resp.status_code >= 400:
                    body = (await resp.aread()).decode("utf-8", "replace")[:400]
                    raise LLMError(f"upstream {resp.status_code}: {body}")
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    chunk = line[5:].strip()
                    if not chunk or chunk == "[DONE]":
                        if chunk == "[DONE]":
                            break
                        continue
                    try:
                        obj = json.loads(chunk)
                    except json.JSONDecodeError:
                        continue
                    choices = obj.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or {}
                    piece = delta.get("content")
                    if piece:
                        yield piece
    except httpx.HTTPError as e:
        raise LLMError(f"{type(e).__name__}: {e}") from e


def _clip(content: str, limit: int) -> str:
    if len(content) <= limit:
        return content
    return content[:limit] + "\n\n[... documento truncado por tamaño ...]"


def analysis_messages(skill: dict, content: str) -> list[dict]:
    user = ANALYSIS_USER.format(
        id=skill["id"],
        source=skill["source"],
        rel_path=skill["rel_path"],
        file_count=skill["file_count"],
        bytes=skill["bytes"],
        name=skill["name"],
        description=skill["description"] or "(sin descripción)",
        content=_clip(content, config()["max_chars"]),
    )
    return [
        {"role": "system", "content": ANALYST_SYSTEM},
        {"role": "user", "content": user},
    ]


def chat_messages(
    skill: dict,
    content: str,
    analysis: str,
    history: list[dict],
) -> list[dict]:
    cfg = config()
    system = (
        f"{ANALYST_SYSTEM}\n\n"
        f"Estás en una conversación sobre UN skill concreto: `{skill['name']}` "
        f"({skill['id']}). Respondés preguntas sobre él, en español, breve y concreto "
        f"(máximo 180 palabras salvo que te pidan detalle). Si la pregunta pide algo que "
        f"el documento no dice, aclaralo en vez de inventar.\n\n"
        f"--- ANÁLISIS PREVIO ---\n{analysis or '(todavía sin analizar)'}\n\n"
        f"--- SKILL.md ({skill['rel_path']}) ---\n{_clip(content, cfg['max_chars'])}"
    )
    clean_history = [
        {"role": m["role"], "content": m["content"]}
        for m in history
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]
    return [{"role": "system", "content": system}, *clean_history[-12:]]


def parse_analysis(text: str) -> dict:
    """Split the model's contract into category, tags and the markdown body.

    A missing or malformed header is not an error: the body is kept and the
    classification simply stays untouched.
    """
    category = ""
    tags: list[str] = []
    summary = ""
    body = text
    head, sep, rest = text.partition("\n---")
    if sep:
        for line in head.splitlines():
            key, _, value = line.partition(":")
            key = key.strip().upper()
            value = value.strip()
            if key == "CATEGORY":
                candidate = value.lower().strip().strip("`*")
                category = candidate if candidate.replace("-", "").isalpha() else ""
            elif key in ("SUMMARY_ES", "RESUMEN", "SUMMARY"):
                summary = value.strip().strip("`*")
            elif key == "TAGS":
                tags = [
                    t.strip().strip("`*").lower()
                    for t in value.split(",")
                    if t.strip()
                ][:8]
        body = rest.split("\n", 1)[1] if "\n" in rest else rest
        if body.lstrip().startswith("---"):
            body = body.lstrip()[3:].lstrip("\n")
    return {
        "category": category,
        "tags": tags,
        "summary": summary[:200],
        "body": body.strip(),
    }
