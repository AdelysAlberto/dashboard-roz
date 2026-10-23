"""Prompt lab: build, preview and send one chat-completions request.

The operator types plain text; the envelope is Roz's job. ``build_payload`` is
pure and is used by both ``/preview`` and ``/run``, so what the panel shows is
byte-for-byte what goes on the wire.

Endpoint, model and key resolve from the environment (``ROZ_LLM_TEST_URL``,
``ROZ_LLM_TEST_MODEL``, ``ROZ_LLM_TEST_KEY``) and the form may override them per
run. The key is never echoed back in a response.
"""

from __future__ import annotations

import json
import os
import time

import httpx

from server.llm_test_prompt import VIARA_MASTER_PROMPT

SYSTEM_TEMPLATE = "<system_instructions>\n{master}\n</system_instructions>"

USER_TEMPLATE = (
    "<user_input>{request}</user_input>\n"
    'Solicitud del usuario: "{request}". Ubicación GPS actual del dispositivo: '
    "Latitude {latitude}, Longitude {longitude}. Vehículo seleccionado por el usuario: "
    "{vehicle}. Preferencias predefinidas de la app: Evitar Autopistas={avoid_highways}, "
    "Evitar Peajes={avoid_tolls}, Preferir Curvas={prefer_curves}."
)

TIMING_KEYS = (
    "time_to_first_token",
    "total_time",
    "prompt_eval_duration",
    "generation_duration",
    "prompt_tokens_per_second",
    "generation_tokens_per_second",
)


class UpstreamError(RuntimeError):
    """The endpoint rejected the request or the transport failed."""


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def defaults() -> dict:
    """Form seed. Empty key means the operator has to type one (or set the env)."""
    return {
        "api_url": _env("ROZ_LLM_TEST_URL"),
        "model": _env("ROZ_LLM_TEST_MODEL"),
        "has_key": bool(_env("ROZ_LLM_TEST_KEY")),
        "temperature": float(_env("ROZ_LLM_TEST_TEMPERATURE", "0.2") or 0.2),
        "timeout": float(_env("ROZ_LLM_TEST_TIMEOUT", "120") or 120),
        "master_prompt": VIARA_MASTER_PROMPT,
        "context": {
            "latitude": _env("ROZ_LLM_TEST_LAT", "40.4618"),
            "longitude": _env("ROZ_LLM_TEST_LON", "-3.7055"),
            "vehicle": _env("ROZ_LLM_TEST_VEHICLE", "moto"),
        },
    }


def _bool_word(value: object) -> str:
    return "true" if bool(value) else "false"


def clamp_temperature(raw: object) -> float:
    """OpenAI-compatible range. A typo must not turn the probe into a 422."""
    if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
        return 0.2
    try:
        value = float(raw)
    except ValueError:
        return 0.2
    return max(0.0, min(2.0, value))


def resolve_url(raw: str) -> str:
    url = (raw or "").strip()
    if not url:
        raise ValueError("API URL is empty: set ROZ_LLM_TEST_URL or type one")
    if not url.startswith(("http://", "https://")):
        raise ValueError("API URL must start with http:// or https://")
    if url.rstrip("/").endswith("/chat/completions"):
        return url
    return f"{url.rstrip('/')}/chat/completions"


def _coerce_effort(raw: object) -> str | float | int | None:
    """oMLX forwards the effort to the chat template, which validates its own
    vocabulary: Qwen3.8 takes 'low'|'medium'|'xhigh', others take a number."""
    text = str(raw or "").strip()
    if not text:
        return None
    try:
        return int(text) if text.isdigit() else float(text)
    except ValueError:
        return text


def build_payload(spec: dict) -> dict:
    """The exact JSON body the lab sends, including the tag envelope."""
    request = str(spec.get("user_prompt") or "").strip()
    context = spec.get("context") or {}
    payload: dict = {
        "model": str(spec.get("model") or "").strip(),
        "temperature": clamp_temperature(spec.get("temperature")),
        "messages": [
            {
                "role": "system",
                "content": SYSTEM_TEMPLATE.format(
                    master=str(spec.get("master_prompt") or "").strip()
                ),
            },
            {
                "role": "user",
                "content": USER_TEMPLATE.format(
                    request=request,
                    latitude=str(context.get("latitude") or "").strip() or "0",
                    longitude=str(context.get("longitude") or "").strip() or "0",
                    vehicle=str(context.get("vehicle") or "").strip() or "unknown",
                    avoid_highways=_bool_word(context.get("avoid_highways")),
                    avoid_tolls=_bool_word(context.get("avoid_tolls")),
                    prefer_curves=_bool_word(context.get("prefer_curves")),
                ),
            },
        ],
    }
    max_tokens = spec.get("max_tokens")
    if max_tokens:
        payload["max_tokens"] = int(max_tokens)

    # Thinking is a per-request switch in oMLX ('on'|'off'); 'default' omits it so
    # the server keeps its own per-model setting. Templates without the branch ignore it.
    thinking = str(spec.get("thinking") or "default").strip().lower()
    if thinking in ("on", "off"):
        payload["enable_thinking"] = thinking == "on"
    effort = _coerce_effort(spec.get("reasoning_effort"))
    if effort is not None:
        payload["reasoning_effort"] = effort
    budget = str(spec.get("thinking_budget") or "").strip()
    if budget.isdigit():
        payload["thinking_budget"] = int(budget)
    return payload


def preview(spec: dict) -> dict:
    return {"url": resolve_url(str(spec.get("api_url") or "")), "payload": build_payload(spec)}


def _api_key(spec: dict) -> str:
    return str(spec.get("api_key") or "").strip() or _env("ROZ_LLM_TEST_KEY")


def send(spec: dict) -> dict:
    """POST the payload and normalise what came back. Raises ``UpstreamError``."""
    url = resolve_url(str(spec.get("api_url") or ""))
    payload = build_payload(spec)
    if not payload["model"]:
        raise ValueError("model is empty: set ROZ_LLM_TEST_MODEL or type one")

    headers = {"Content-Type": "application/json"}
    key = _api_key(spec)
    if key:
        headers["Authorization"] = f"Bearer {key}"

    timeout = float(_env("ROZ_LLM_TEST_TIMEOUT", "120") or 120)
    started = time.perf_counter()
    try:
        with httpx.Client(timeout=httpx.Timeout(timeout, connect=15.0)) as client:
            response = client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise UpstreamError(f"{type(exc).__name__}: {exc}") from exc
    latency_ms = int((time.perf_counter() - started) * 1000)

    if response.status_code >= 400:
        body = response.text[:600]
        raise UpstreamError(f"upstream {response.status_code}: {body}")
    try:
        body = response.json()
    except ValueError as exc:
        raise UpstreamError(f"upstream sent non-JSON: {response.text[:300]}") from exc
    if not isinstance(body, dict):
        raise UpstreamError("upstream sent an unexpected shape (not an object)")

    return extract(body, latency_ms, url, payload)


def _parse_content(content: str) -> tuple[object | None, str | None]:
    """Model JSON, tolerating ```json fences. Returns (value, error)."""
    text = content.strip()
    if not text:
        return None, None
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        text = text.rsplit("```", 1)[0]
    try:
        return json.loads(text), None
    except json.JSONDecodeError as exc:
        return None, f"{exc.msg} (line {exc.lineno}, column {exc.colno})"


def extract(body: dict, latency_ms: int, url: str, payload: dict) -> dict:
    choices = body.get("choices") or []
    first = choices[0] if isinstance(choices, list) and choices else {}
    message = first.get("message") or {}
    content = message.get("content") or ""
    usage = body.get("usage") or {}
    details = usage.get("prompt_tokens_details") or {}
    parsed, parse_error = _parse_content(str(content))
    return {
        "content": content,
        "reasoning": message.get("reasoning_content") or None,
        "parsed": parsed,
        "parse_error": parse_error,
        "meta": {
            "id": body.get("id"),
            "model": body.get("model"),
            "created": body.get("created"),
            "role": message.get("role"),
            "finish_reason": first.get("finish_reason"),
            "usage": {
                "prompt_tokens": usage.get("prompt_tokens"),
                "completion_tokens": usage.get("completion_tokens"),
                "total_tokens": usage.get("total_tokens"),
                "cached_tokens": details.get("cached_tokens"),
            },
            "timings": {key: usage.get(key) for key in TIMING_KEYS},
        },
        "latency_ms": latency_ms,
        "request": {"url": url, "payload": payload},
        "raw": body,
    }
