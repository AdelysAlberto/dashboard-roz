import type { EngineName, ServiceKind } from './engine';

export type ServiceUnitState =
  | 'up'
  | 'partial'
  | 'booting'
  | 'down'
  | 'unexpected'
  | 'unknown';

/** Card-level rollup computed by the backend: all units up, all down, or mixed. */
export type ServiceState = 'on' | 'partial' | 'off' | 'unknown';

export type ServiceOp = 'start' | 'stop' | 'restart';

export interface ServiceUnit {
  id: string;
  name: string;
  port: number | null;
  ports: number[];
  health: string | null;
  state: ServiceUnitState;
  pid: number | null;
  detail: string | null;
  uptime_sec: number | null;
  ops: ServiceOp[];
}

export interface ServiceAction {
  id: string;
  label: string;
  danger: boolean;
  detached: boolean;
}

export interface ServiceInfo {
  id: string;
  name: string;
  /** Categoría cerrada para el filtro del tablero (llm | voice | assistant | api | dashboard | infra). */
  kind: ServiceKind;
  /** Motor con adapter propio en el backend ('' si es un servicio normal). */
  engine: EngineName | '';
  dirname: string;
  description: string;
  url: string | null;
  tags: string[];
  self: boolean;
  dir: string;
  docs: string | null;
  has_docs: boolean;
  units: ServiceUnit[];
  actions: ServiceAction[];
  state: ServiceState;
  units_on: number;
  units_total: number;
}

export interface ServiceSnapshot {
  root: string;
  services: ServiceInfo[];
}

export interface ServiceDoc {
  path: string;
  content: string;
}

export interface ServiceStepResult {
  label: string;
  command: string;
  detached: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

export interface ServiceActionResult {
  ok: boolean;
  detached: boolean;
  service: string;
  steps: ServiceStepResult[];
}

export interface ServiceActionRequest {
  service_id: string;
  unit_id?: string;
  op?: ServiceOp;
  action_id?: string;
}

/** UI-only: which action is currently in flight, so controls can lock. */
export interface PendingAction {
  serviceId: string;
  unitId?: string;
  actionId?: string;
  op?: ServiceOp;
}
