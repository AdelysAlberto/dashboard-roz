# Walkthrough: Migración del Frontend de Roz a React 19 + TypeScript + Bun

## 1. Solicitud del Usuario
- Migrar todo el dashboard web de **Roz** a **React 19.3**, **TypeScript**, **Bun** y **Vite**.
- Implementar **Screaming Architecture**: separar vistas de la capa lógica y mantener componentes reutilizables con variantes (`Button`, `Badge/Pill`, `Modal`, `Input`, `Textarea`, `Select`, `Alert`, `Tabs`, `Toast`).
- **Sidebar Izquierdo**:
  - Filtros en dropdowns (por estado y por ruta raíz).
  - Ordenación alfabética y por fecha/estado.
  - Agrupación por carpetas (root, subfolder, módulo o plano).
- **Persistencia**:
  - Rutas de escaneo y preferencias persistidas en `LocalStorage`.
- **UI & Temas**:
  - Sistema Dark/Light pulido con paleta coherente.
  - Stream de análisis WebSocket interactivo con soporte para extensiones UI (`ask_user_question`, confirmaciones).
  - Monitoreo en tiempo real de subagentes.

---

## 2. Solución Aplicada

### A. Estructura Screaming Architecture (`frontend/src/`)
```
frontend/src/
├── types/                # Modelos de dominio (document, pilot, common)
├── services/             # Cliente API tipado, QueryKeys y LocalStorage wrapper
├── stores/               # Zustand 5 (useThemeStore, useDocSelectionStore, useFilterStore, useAnalysisStore, useMonitorStore, useModalStore, useToastStore)
├── styles/               # Design Tokens Dark/Light, reset y markdown styles
├── components/
│   ├── ui/               # Componentes atómicos reutilizables con variantes (Button, Badge, Modal, Input, Textarea, Select, Alert, Tabs, ToastContainer)
│   └── layout/           # Header, MainLayout, Split Layout
└── features/
    ├── documents/        # DocSidebar, DocViewer, FrontmatterHeader, MarkdownRenderer, hooks
    ├── actions/          # StatusButtons, FileOperations, AnalysisLauncher, hooks
    ├── analysis/         # LiveAnalysisPane, InteractiveDialog, ChatInputRow, hooks
    ├── monitor/          # PiSessionsGrid, SessionCard, SessionDetailLog, hooks
    ├── paths/            # ScanPathsModal, LocalStorage history, hooks
    └── validation/       # FrontmatterConventionAuditModal, hooks
```

### B. Dependencias y Versiones Modernas Instaladas
- `react@19.3.0` & `react-dom@19.3.0`
- `typescript@6.0.3` & `vite@8.3.1`
- `zustand@5.0.15`
- `@tanstack/react-query@5.104.0`
- `lucide-react@1.48.0`
- `react-markdown@10.1.0`, `remark-gfm@4.0.1`, `rehype-highlight@7.0.2`

### C. Integración con Backend FastAPI y `start.sh`
- `server/app.py`: Detecta y sirve automáticamente los estáticos compilados en `frontend/dist` (`/assets` y `/`).
- `start.sh`: Compila automáticamente el frontend si la carpeta `dist` no existe y `bun` está disponible.
- `frontend/vite.config.ts`: Configura proxy para desarrollo local (`/api` y `/ws` hacia el backend en puerto 8756).

---

## 3. Decisiones Técnicas Relevantes
1. **Separación Estricta de Estado**:
   - *Server State*: Administrado con `@tanstack/react-query` (documentos, detalle, configuración, auditoría, sesiones de monitoreo con polling reactivo).
   - *UI/Client State*: Administrado con `zustand 5` (tema, documento seleccionado, filtros activos, estado de sesión WebSocket, modales y toasts).
2. **Componentes Puros y Reutilizables**:
   - Cada componente UI base en `components/ui/` cuenta con sus variantes estilizadas mediante variables CSS y tokens de diseño.
3. **Persistencia Dual de Rutas**:
   - Las rutas activas se sincronizan con el backend vía `/api/roots` y se guarda un historial de marcadores en `localStorage` para reincorporar carpetas rápidamente.

---

## 4. Deuda Técnica
- Ninguna deuda técnica introducida. Se mantiene retrocompatibilidad total con la carpeta legacy `web/` en caso de requerirse.

---

## 5. Cambios en Variables de Entorno
- No se requieren nuevas variables de entorno.

---

## 6. Validación Realizada
- [x] Compilación exitosa de TypeScript y Vite con `bun run build` (0 errores).
- [x] Arranque del servidor con `./stop.sh && ./start.sh`.
- [x] Verificación de endpoints HTTP `/`, `/assets/*`, `/api/roots`, `/api/config`, `/api/docs`.
- [x] Verificación de la estructura y exports de componentes.
