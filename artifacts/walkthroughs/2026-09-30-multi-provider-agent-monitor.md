---
title: Multi-Provider Agent Monitoring (Pi + OpenCode)
module: backend / monitor / frontend / providers
date: 2026-09-30
status: Done
priority: P1
scope: "[MVP]"
source: user_request
---

# Multi-Provider Agent Monitoring (Pi & OpenCode)

## Summary of Changes

Desacoplamos la arquitectura de monitorización de `roz` para convertirla en un sistema extensible basado en `ProviderRegistry` y adaptadores individuales para cada motor de agentes:

1. **Abstracción `BaseAgentProvider`** ([server/providers/base.py](file:///Volumes/Datos/Projects/services/roz/server/providers/base.py)):
   - Contrato unificado para listar sesiones, extraer logs en tiempo real (`tail_log`) y cancelar procesos (`kill_session`).

2. **Adaptador `PiAgentProvider`** ([server/providers/pi_provider.py](file:///Volumes/Datos/Projects/services/roz/server/providers/pi_provider.py)):
   - Encapsula la monitorización de subagentes en `/tmp/pi-subagents-*/` y sesiones JSONL de `~/.pi/agent/sessions/`.

3. **Adaptador `OpenCodeAgentProvider`** ([server/providers/opencode_provider.py](file:///Volumes/Datos/Projects/services/roz/server/providers/opencode_provider.py)):
   - Monitorea agentes en segundo plano y sesiones primarias leyendo la base de datos `~/.local/share/opencode/opencode.db` (soporte completo para esquema moderno `session_v2` y `session_message` además de tablas legacy).
   - Extrae eventos estructurados desde `session_message` y `part` (herramientas, razonamiento/pensamiento, texto y resultados).
   - Correlaciona procesos activos vía `ps` e identifica subagentes mediante `parent_id` y `agent`.
   - Limpia prefijos automáticos de prompts de subagentes para resaltar el título y propósito real de cada tarea.

4. **Registro Central `ProviderRegistry`** ([server/providers/__init__.py](file:///Volumes/Datos/Projects/services/roz/server/providers/__init__.py) y [server/monitor.py](file:///Volumes/Datos/Projects/services/roz/server/monitor.py)):
   - Agrega todas las sesiones de forma unificada y enruta las peticiones de log según el URI o prefijo (`opencode://...` vs archivos JSONL).

5. **UI Frontend React** ([frontend/src/features/monitor/](file:///Volumes/Datos/Projects/services/roz/frontend/src/features/monitor/)):
   - **`SessionCard`**: Muestra un Badge distintivo del proveedor (`[OpenCode]` / `[Pi]`).
   - **`MonitorPane`**: Añade selector de pestañas para filtrar sesiones (`All`, `Pi`, `OpenCode`) y contadores desglosados en tiempo real.
   - **`SessionDetail`**: Muestra el badge del proveedor y reproduce los logs transparentemente sea cual sea el origen.

## Verification

- Backend verificado: Se agregaron y validaron 181 sesiones combinadas (`pi` y `opencode`).
- API verificada: `/api/monitor/sessions` y `/api/monitor/log?path=opencode://...` responden con estructura y eventos normalizados.
- Frontend compilado: `npm run build` ejecutado exitosamente y servido en `http://127.0.0.1:8756`.
