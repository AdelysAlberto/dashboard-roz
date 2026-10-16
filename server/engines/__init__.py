"""Motor adapters: cada motor local (oMLX, Ollama, Splash, Kokoro, Whisper) expone su propia superficie.

El manifest declara `"engine": "omlx" | "ollama" | "splash" | "kokoro" | "whisper"`. El adapter traduce
operaciones tipadas (modelos, settings, descargas, métricas) a la API real de ese motor; Roz no
intenta un formulario genérico porque las superficies son distintas.
"""

from __future__ import annotations

from typing import Any, Callable

from server import services
from server.engines import kokoro, ollama, omlx, splash, whisper

MODULES: dict[str, Any] = {
    "omlx": omlx,
    "ollama": ollama,
    "splash": splash,
    "kokoro": kokoro,
    "whisper": whisper,
}


def engine_of(service_id: str) -> str:
    svc = services.get(service_id)
    if svc is None:
        raise ValueError(f"Unknown service: {service_id}")
    name = str(svc.get("engine") or "").strip().lower()
    if name not in MODULES:
        raise ValueError(f"{svc['name']} no declara 'engine' (oMLX | Ollama | Splash | Kokoro | Whisper)")
    return name


def module_of(service_id: str) -> Any:
    return MODULES[engine_of(service_id)]


def call(service_id: str, fn: str, *args: Any, **kwargs: Any) -> Any:
    """Invoca `fn` en el adapter del motor; error claro si ese motor no la soporta."""
    module = module_of(service_id)
    func: Callable[..., Any] | None = getattr(module, fn, None)
    if func is None:
        raise ValueError(f"{engine_of(service_id)} no soporta '{fn}'")
    return func(service_id, *args, **kwargs)
