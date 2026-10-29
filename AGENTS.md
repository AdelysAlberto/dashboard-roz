---
title: "roz — Project Contract"
module: server / frontend / providers
author: human
date: 2026-10-21
status: Done
priority: P1
scope: "[MVP]"
source: docs/README.md
---

# roz — Project Contract

Supervision dashboard for Markdown docs and agent sessions. FastAPI backend in
`server/`, React 19 + Vite SPA in `frontend/`, served from `web/`.

## 0. Verification gate

Run from the repository root. All four must pass before claiming a change works.

```bash
.venv/bin/python -m unittest discover -s tests -t .   # unit + process tests
.venv/bin/python -c "import server.app"               # every route imports
cd frontend && bun run lint                           # 0 errors (warnings are pre-existing)
cd frontend && bun run build                          # tsc -b && vite build
```

The SPA is only rebuilt by `bun run build`; `frontend/dist` is what roz serves,
so a backend-only change still needs the build if you touched types shared with
the UI. Live checks go against the running instance (`./start.sh`, then
`curl 127.0.0.1:$ROZ_PORT/api/monitor/sessions`); a restart is required to load
backend changes (`./stop.sh && ./start.sh`).

## 1. Repository map

| Path | What lives there |
|---|---|
| `server/app.py` | HTTP routes, startup, static mount |
| `server/monitor.py` | Session listing, log tail, interrupt entry point |
| `server/session_cache.py` | Parsed-transcript cache keyed by (mtime, size) |
| `server/latigazo.py` | Interrupt ladder policy and the unattended watchdog |
| `server/providers/` | One adapter per agent runtime; the only place that knows a runtime |
| `server/engines/` | Inference-engine adapters (oMLX, Ollama, Splash, Kokoro, Whisper) |
| `server/pilot.py` | Long-lived `pi --mode rpc` sessions driven over WebSocket |
| `server/llm_test.py` | Test IA: builds the prompt envelope, posts one probe, normalises the reply |
| `frontend/src/features/<surface>/` | One folder per surface: `components/`, `hooks/` |
| `tests/` | `unittest`, stdlib only: no pytest dependency |

Data, not code: `.venv/`, `frontend/node_modules/`, `frontend/dist/`,
`artifacts/` (scanned, never searched with `grep -r` from the root).

## 2. Provider contract

A runtime is added by writing one adapter in `server/providers/` and registering
it in `DEFAULT_PROVIDERS`. Each adapter must:

- Return the normalized session dict documented in `base.py` (including
  `interrupt_levels`, the rungs it can actually reach).
- Advertise **only** levels it can honour. Claiming `turn` without a real abort
  surface makes the dashboard send a signal that silently does nothing. pi
  computes this per session (`_interrupt_levels`): `turn` appears only while
  `pilot.registry.run_for_session(path)` owns the transcript.
- Never signal infrastructure shared by other sessions. `opencode serve
  --service` is one process for every opencode session: the ladder goes through
  `opencode api` (`session.interrupt`, `shell.remove`), never `SIGTERM`.
- `opencode api` wraps every response as `{"location": …, "data": …}`. Unwrap in
  `_oc_api`; reading the envelope directly made `shell.list` look empty and
  `interrupted` look false.
- Never inherit the caller's `pi` identity. `start.sh` drops `PI_SESSION_FILE`,
  `PI_SESSION_ID`, `PI_MODEL`, `PI_PROVIDER`, `PI_REASONING_LEVEL` and
  `PI_CODING_AGENT`: an inherited session file makes a pilot run append to the
  launcher's transcript, and an inherited ambiguous model kills the run at
  startup (`deepseek-flash` matches two providers).
- Answer `interrupt()` with an `InterruptOutcome`, including `ok=False` and a
  reason. Degrading to an exception loses the reason in the HTTP layer.

The ladder, weakest first:

| Level | Effect | Session state after |
|---|---|---|
| `tool` | Kills the process group of the tool call in flight | Turn resumes with `exit 143`; context intact |
| `turn` | Aborts the agent turn | Session alive and resumable |
| `kill` | Terminates the agent process | Transcript survives in the session file |

## 3. Machine invariants

- Titles and messages of human-facing log lines use **local time**. Machine
  timestamps stay ISO-8601 with `Z`. Mixing them made a 10 minute freeze read as
  2 hours in the dashboard.
- Configuration resolves from environment variables with a sane default:
  `ROZ_LATIGAZO_TOOL_SECONDS`, `ROZ_LATIGAZO_COOLDOWN`, `ROZ_LATIGAZO_AUTO`,
  `ROZ_WATCHDOG_INTERVAL`, `OPENCODE_BIN`, `OPENCODE_DB_PATH`.
- The local image generator runs on `~/.venvs/mflux` (Python 3.14, mflux 0.23.0)
  and it needs `pillow<13` **pinned**: Pillow 13.0.0 imports
  `numbers._IntegralLike`, which no CPython on this machine ships, and mflux
  imports PIL at module load, so the worker dies before it can load anything.
  `uv pip install mflux` selects 13.0.0 again; re-pin after any upgrade.
- `ROZ_HOST` defaults to `127.0.0.1`. Binding `0.0.0.0` without `ROZ_USER` and
  `ROZ_PASS` publishes pilot (which runs `pi`), the services board and every
  scanned transcript to whoever reaches the port: the gate is HTTP Basic on
  every non-loopback request and WebSocket handshake (`server/auth.py`). A
  successful login also plants an HMAC cookie (`roz_auth`) because browsers do
  not all attach `Authorization` to a WS handshake. Loopback stays exempt so
  the local `curl 127.0.0.1:$ROZ_PORT` checks keep working. The cookie is not
  marked `Secure`: the LAN instance is plain HTTP and the flag would drop it.
- The watchdog never escalates past `tool` on its own. `turn` and `kill` are
  operator decisions.
- A tool is cut only for `stalled` sessions: the provider already established
  that the agent holds the turn with a tool in flight. `quiet` and `active` are
  never touched.
- Pure decision logic lives apart from the executor (`latigazo.decide` +
  injected `interrupt` callable) so it is testable without a process table.
- Listing sessions is cached by file identity (`mtime_ns` + `size`) in
  `session_cache`: a cold pass reads ~258 transcripts and ~140 MB. Only what
  depends on the file is cached; pids, name maps and watchdog annotations are
  recomputed every pass. `POST /api/monitor/cache/refresh` is the escape hatch
  and the dashboard exposes it as **Refresh cache**.

## 4. Frontend data layering

`Service ← Hook ← View`: a view consumes a hook, the hook consumes `api.ts`.
Views never import `services/api` for mutations and never touch TanStack Query.
Server state lives in `hooks/use*.ts`.

### Diagrams

Mermaid blocks are drawn by **pele** (`pele/lazy`, one code-split chunk per
diagram type), not by mermaid.js: it produces the SVG synchronously, weighs a
fraction of the mermaid bundle, and takes its palette from the `--pele-*`
variables set on `.mermaid-canvas`. Palette overrides belong there, never in
the diagram source.

The modal viewer owns zoom and pan through a CSS transform
(`documents/hooks/useDiagramViewport.ts` + `utils/diagramViewport.ts`), not
pele's `enableZoom`: that one derives its scale from the width only and would
clip a drawing taller than the box. A diagram opens at its natural size capped
to the box width, because fitting it whole opened most of the corpus at 30-60 %;
the whole-drawing view is a button. The first `Escape` resets the view and only
the second closes the modal. The diagram modal passes `closeOnBackdrop={false}`:
aim at a zoom button, miss, and the viewer would vanish mid-reading.

`MarkdownRenderer` keeps its `components` map at module scope. A fresh map per
render gives react-markdown new component types, which remounts every node: the
session poll in `MainLayout` (4 s) closed any open diagram that way.

### Responsive (iPad)

- The tab strip **scrolls** (`overflow-x: auto`, `flex: 0 0 auto` on each tab).
  Seven tabs need 758px of labels; wrapping put "Subagent Monitor" on two lines
  and clipped the last tab at 768px.
- The left rail collapses from the header toggle and the choice persists
  (`useLayoutStore` → `roz-rail-collapsed`). Collapsed at 768px the centre column
  goes from 508px to 768px, which is what makes the whole tab strip fit.
- Grid tracks are assigned explicitly (`.column-left` 1, `.column-center` 2,
  `.column-right` 3, with per-layout overrides). With `display: none` on the
  collapsed rail, auto-placement put the centre column in the 0px track.
- Heights use `100dvh` (with a `100vh` fallback). On iOS Safari `100vh` is the
  largest viewport, so a full-height column pushed its footer below the visible
  area and the lab submit buttons were unreachable.
- Toolbars wrap into rows (`flex-wrap`) instead of squeezing: the monitor toolbar
  needed 659px inside a 508px column.

## 5. Test IA (prompt lab)

One tab for measuring what the Viara master prompt actually returns. The form
edits plain text; **Roz owns the envelope**: the master prompt is sent inside
`<system_instructions>…</system_instructions>` and the user request inside
`<user_input>…</user_input>` followed by the device line (GPS, vehicle, the
three app preferences). `POST /api/llm-test/preview` returns that body without
spending a model call, which is the only way to verify the wrapping.

- Non-streaming on purpose: the endpoint answers in ~2.5 s and the metadata
  (`usage`, `time_to_first_token`, tokens/second) arrives with the body.
  `latency_ms` is measured by roz, so a slow socket is not blamed on the model.
- Endpoint, model and key resolve from `ROZ_LLM_TEST_URL`, `ROZ_LLM_TEST_MODEL`,
  `ROZ_LLM_TEST_KEY`; the form may override them per run but the key is never
  echoed in a response and never written to `localStorage`.
- The content is the hero: the panel shows `choices[0].message.content` (raw or
  re-printed JSON) and everything else — model, finish reason, id, tokens,
  timings, the exact POST target — as secondary values.
- The default master prompt lives in `server/llm_test_prompt.py`; keep it
  byte-identical to production, otherwise the lab measures another model.
- Thinking is sent per request as `enable_thinking` (oMLX forwards it to
  `chat_template_kwargs`), plus optional `reasoning_effort` and
  `thinking_budget`. `Model default` omits the field so the server keeps its own
  per-model setting; the reply never echoes any of them. The template decides:
  the `Qwen3-*-Instruct-2507` models have no thinking branch (measured: same
  tokens with the flag on, off and absent), `Qwen3.8-27B-*` defaults to thinking
  with `reasoning_effort` in `low | medium | xhigh`. When thinking does run,
  oMLX returns it in `message.reasoning_content`, which the panel shows in its
  own collapsible block and never mixes into `content`.

## 6. Test Imagen (diffusion lab)

Same contract as Test IA, one tab to the right: the operator types plain text,
**Roz owns the envelope**. Three upstream shapes, because the local options
disagree, and the form picks one from `ROZ_IMAGE_TEST_BACKEND` = `auto` |
`a1111` | `openai` | `local` (or the Shape selector at runtime):

| Shape | Route | Body |
|---|---|---|
| `a1111` | `POST {base}/sdapi/v1/txt2img` | prompt, negative_prompt, width, height, steps, cfg_scale, seed |
| `openai` | `POST {base}/v1/images/generations` | model, prompt, size, response_format=b64_json |
| `local` | in-process, via `server/mflux_worker.py` | prompt, negative_prompt, steps, guidance, width, height, seed, out_path |

- The prompt is `master prompt` + `subject` + framing line, in that order. The
  framing line is what carries the orientation; sizes are the Qwen-Image model
  card buckets (`1:1` 1328², `16:9` 1664×928, `9:16` 928×1664), not arbitrary
  numbers that drift off the trained bucket.
- Diffusion has no temperature. The rail offers steps and guidance (CFG), with
  the model card's 50 / 4.0 as defaults, and says so instead of inventing a
  slider that does nothing.
- The reply is base64; `image_store` decodes it, writes the PNG **losslessly** to
  `ROZ_IMAGE_TEST_OUT` (`artifacts/images`) and returns the same bytes for the
  preview. `GET /api/image-test/file/{name}` serves that file for the download
  button and refuses any name that resolves outside the output directory.
- A generator is a separate runtime from oMLX: `mlx-lm` serves chat models, so a
  loaded chat model never yields an image. The lab talks to whatever service
  exposes one of the two HTTP shapes above (`ROZ_IMAGE_TEST_URL`); with nothing
  configured it answers 400, never a fake image. The third shape skips HTTP
  entirely.

### Local backend (mflux)

`local` means roz loads the weights itself. `server/mflux_local.py` spawns one
resident worker (`server/mflux_worker.py`) with the interpreter that has mflux —
`ROZ_MFLUX_PYTHON`, default `~/.venvs/mflux/bin/python` — and drives it with one
JSON object per line. roz never imports mlx: a 20B diffusion model living inside
the web server would take 22 GB it has no way to give back.

- `server/mflux_models.py` validates the folder **without mlx**: the component
  trees (`transformer/`, `vae/`, `text_encoder/`) plus the text-encoder tree of
  its family, and a name or README that says Qwen-Image. Pointing the worker at a
  chat-model folder has to fail in milliseconds, not after 22 GB of weights.
- Two families, two layouts, two mflux classes, and they are not interchangeable:
  `qwen-image` (2512/2511) uses `tokenizer/` and `QwenImage` + `ModelConfig.qwen_image()`;
  `qwen-image-2.1` uses `processor/` (Qwen3-VL) and `QwenImage21` +
  `ModelConfig.qwen_image_21()`. The family travels in the load request, so a
  2.1 folder that only carries `tokenizer/` is reported as missing `processor/`
  instead of dying inside attention on the wrong shapes. 2.1 takes guidance
  around 1.0 (`QwenImage21.generate_image` default) — the card says so when that
  checkpoint is loaded, and still sends whatever the rail holds.
- The worker warms up with one 512² step. mlx materialises lazily, so without it
  `ready` would only mean "constructed" and the first real generation would pay
  the load. A failed warmup is reported as a warning on a loaded model, never as
  a failed load.
- `load` answers before the weights are resident. The state machine
  (`idle | loading | ready | generating | error`) is what the form polls
  (2 s while busy, 15 s idle); no request is held open for a minute-long load.
- A generation outlives the request that started it: reload the tab and the POST
  dies while the worker keeps denoising, and the PNG lands in
  `ROZ_IMAGE_TEST_OUT` anyway. That is why `/status` carries `started_at` +
  `elapsed_ms` (the clock, redrawn from the server after a reload) and
  `last_run` (the finished image, without base64 — the card reads the same PNG
  from `/api/image-test/file/{name}`). `last_run` lives in the process: a roz
  restart forgets it, the file stays.
- One model at a time and one generation at a time (`409` on conflict): the two
  checkpoints on this machine are 21.8 and 24.1 GiB, so two of them is a swap
  storm. `unload` and the app shutdown event both reap the child.
- Checkpoints are discovered one level under `ROZ_IMAGE_TEST_MODELS_DIR`
  (`/Volumes/Datos/OllamaModels/oMLX/mlx-community`); `ROZ_IMAGE_TEST_LOCAL_MODEL`
  is the default folder, the 3-bit one on this machine. The path field stays
  editable, so a checkpoint outside that root still runs.
- Generation is long by design (a 20B sampler on a 48 GB Mac takes minutes), so
  the endpoint blocks like the HTTP backends do and the pane keeps its clock.
