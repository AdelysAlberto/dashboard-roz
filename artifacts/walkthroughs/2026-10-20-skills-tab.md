---
title: "SKILLS-TAB — Catálogo de skills con taxonomía, explicación LLM y chat"
module: "roz / skills / frontend / backend"
author: homero
date: 2026-10-20
status: Done
priority: P1
scope: "[MVP]"
source: user_request
---

# Skills tab: catálogo, taxonomía y explicación asistida

## Problema

93 skills repartidos en dos raíces (`agents-global/skills` y `agents-pi-mac/skills`), sin forma de
saber qué hay, de qué tipo es, ni cuándo conviene usar cada uno. La descripción declarada en cada
`SKILL.md` está escrita para que la **lea un modelo** y decida si cargar el skill: no explica a un
humano qué le resuelve.

## Decisión de diseño

| Pregunta | Decisión | Motivo |
| :--- | :--- | :--- |
| ¿Se taggean los `SKILL.md`? | **No.** Índice overlay propio de Roz (`.roz_skills.json`) | El spec Agent Skills admite `metadata` libre, pero un YAML mal formado hace que el loader descarte el skill ("malformed SKILL.md … are not loaded"). Escribir en 93 archivos globales a mano no compensa el riesgo: el overlay es reversible, y si una carpeta desaparece se reporta como *orphan*. |
| ¿Dónde vive la explicación? | Cacheada en el overlay junto a `content_hash` | Reanalizar cuesta tokens; el hash permite marcar *out of date* cuando el documento cambia. |
| ¿Cómo se habla con el modelo? | HTTP OpenAI-compatible con SSE desde FastAPI | Latencia de primer token de ~1 s frente a los segundos que tarda en arrancar un subproceso `pi`, y sin quemar contexto por click. |
| ¿Y cuando hace falta investigar fuera? | Botón *Deep dive with tools* → sesión `pi` real sin agente | El endpoint HTTP no tiene herramientas: no puede leer GitHub. En vez de simularlo, se delega en el piloto ya existente y la sesión aparece en la pestaña Analysis. Se lanza **sin** `--agent` porque el pi instalado (1.3.x) ya no expone ese flag: ver *Hallazgos*. |
| Layout | Master-detail + rail de chat | Coherente con la pestaña Document (lista · ficha · acciones) y deja el documento largo en el centro. |

## Taxonomía

Autoridad de categoría, de mayor a menor:

1. **Tag manual** guardado en el overlay (`POST /api/skills/tags`).
2. **`metadata.category`** declarado dentro del propio `SKILL.md` (legal según el spec, ignorado por
   los loaders).
3. **Heurística** por palabras clave: peso 5 si aparece en el nombre del directorio, 1 si aparece en
   la descripción. `CATEGORY_OVERRIDES` corrige los casos donde la prosa engaña (un skill de vídeo
   que habla de diseño, un skill de tooling que menciona imágenes).

Categorías cerradas (12 + `other`): design, ux, frontend, backend, quality, security, writing,
product, legal, finance, media, meta.

## Contrato del análisis

El modelo responde con un contrato parseable:

```text
CATEGORY: <clave>
TAGS: a, b, c
SUMMARY_ES: <una frase en español que reemplaza la description declarada en la ficha>
---
## Qué es
## Cuándo lo usás
## Qué te resuelve
## Cómo se usa
## Con qué no confundirlo
## Señal de que lo necesitás hoy
```

`parse_analysis()` separa cabecera y cuerpo. Si la cabecera falta o viene mal, el cuerpo se guarda
igual y la categoría no se toca: nunca se pierde la respuesta por un formato inesperado.

`SUMMARY_ES` existe porque la `description` del `SKILL.md` está escrita para el router del agente
("Build crafted, highly detailed, interactive isometric SVG figures…"), no para una persona: la ficha
muestra la frase en español y deja la declarada detrás de un toggle.

## Superficie

| Capa | Archivos |
| :--- | :--- |
| Escaneo (solo lectura) | `server/skills_scan.py` |
| Overlay index | `server/skills_index.py` |
| Cliente LLM + prompts | `server/skills_llm.py` |
| HTTP + SSE + deep dive | `server/skills_api.py` |
| UI | `frontend/src/features/skills/**`, `stores/useSkillsStore.ts`, `services/skillStream.ts`, `utils/skills.ts` |

## Evidencia de verificación

- `bun run build` → `tsc -b && vite build` sin errores; `bun run lint` sin avisos nuevos en
  `features/skills/**`.
- `GET /api/skills` → 93 skills, 12 grupos, 2 raíces (`agents-global` 37 · `agents-pi-mac` 56).
- `POST /api/skills/analyze` (el-pregonero) → SSE con deltas, `done` con `category: meta` y 5 tags;
  el resultado persiste en `.roz_skills.json`.
- `POST /api/skills/chat` desde la UI: respuesta correcta y negativa explícita a inventar
  ("el documento no define qué pasa si dos agentes notifican a la vez").
- `POST /api/skills/deepdive` → `run-0001` vivo con 170 eventos, cerrado con `/api/analyze/close`.
- Navegador real (Chrome headless + CDP, 1680×1010): tab Skills → 93 filas, 12 grupos, ficha con
  análisis renderizado, streaming visible, chat respondiendo, y `console.error` = 0.

## Segundo pase: pilot arreglado + descripción en español

### `pilot.py`: `--agent` eliminado, persona por system prompt

El pi instalado (1.3.0) ya no expone `--agent`: cualquier run con agente seleccionado moría con
`Error: Unknown option: --agent` y `exit_code: 1`, es decir, toda la pestaña Analysis y el deep dive.

Ahora `PI_AGENTS_DIR` declara el directorio con un `<agente>.md` por agente y el piloto resuelve el
nombre a un archivo real que se inyecta **después** de `PI_FLAGS` con `--append-system-prompt`
(la persona queda como instrucción más cercana). Un nombre sin archivo no rompe el run: emite un
`roz_stderr` explicando que se ejecuta con el prompt por defecto, y `GET /api/config` oculta del
desplegable los agentes inexistentes.

Evidencia: `run` con `agent=sheldon` → persona resuelta, proceso vivo, 61 eventos, `idle: true`;
`agent=noexiste` → warning + run vivo; `POST /api/analyze` con `sheldon` completó y se cerró limpio.

### `SUMMARY_ES`

Evidencia: `POST /api/skills/analyze?force` sobre `anatomy`, `el-pregonero` e `i18n-localization`
→ `summary_es` persistido y devuelto en el evento `done`; en navegador la ficha muestra la frase en
español y el toggle *Declared description (EN)* despliega el texto original.

## Nota de entorno (no es un defecto del código)

`PI_MODEL` exportado en el shell pisa el `.env` porque dotenv no sobreescribe variables existentes.
Con `PI_MODEL=deepseek-flash` el modelo resulta ambiguo entre dos providers y `pi` aborta al arrancar.
Roz se relanzó con `env -u PI_MODEL ./start.sh` para que tomara `dell3-heretic` del `.env`.
