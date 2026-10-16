export type ServiceKind = 'llm' | 'voice' | 'assistant' | 'api' | 'dashboard' | 'infra';

export type EngineName = 'omlx' | 'ollama' | 'splash' | 'kokoro' | 'whisper';

/** Modelo normalizado por los adapters (oMLX y Ollama comparten forma). */
export interface EngineModel {
  id: string;
  name: string;
  loaded?: boolean;
  loading?: boolean;
  size?: string | null;
  type?: string | null;
  context?: number | null;
  default?: boolean;
  favorite?: boolean;
  pinned?: boolean;
  helper?: boolean;
  source?: string | null;
  parameter_size?: string | null;
  quantization?: string | null;
  size_vram?: string | null;
  expires_at?: string | null;
  modified_at?: string | null;
}

export interface EngineModels {
  models: EngineModel[];
  total: number;
  loaded?: EngineModel[];
  model_dir?: string | null;
}

export interface EngineSettings {
  /** oMLX devuelve los settings globales agrupados (server, memory, cache, sampling…). */
  groups: Record<string, Record<string, unknown>>;
}

export interface EngineTask {
  id: string;
  kind: string;
  label: string;
  state: 'running' | 'done' | 'error';
  progress: number;
  detail: string;
}

export interface EngineMetrics {
  [section: string]: unknown;
}

export interface HfResult {
  id?: string;
  modelId?: string;
  repo_id?: string;
  downloads?: number;
  likes?: number;
  size?: string;
  tags?: string[];
}

export type EngineLogs = { lines: string };

/** Kokoro: catálogo de voces (embeddings fijos del modelo) + estado del servicio. */
export interface KokoroVoice {
  id: string;
  lang: string;
}

export interface KokoroVoices {
  voices: KokoroVoice[];
  total: number;
  default: string;
  model_loaded: boolean;
}

/** Kokoro: resultado de una prueba de voz (audio en base64 para <audio>). */
export interface KokoroSynthesis {
  audio_base64: string;
  format: string;
  duration_seconds: number | null;
  voice: string | null;
}

/** Whisper STT: estado del modelo residente en RAM (GET /health). */
export interface WhisperHealth {
  status: string;
  service: string;
  model: string;
  default_language: string;
  model_loaded: boolean;
  memory_mode: 'eager' | 'lazy';
  idle_ttl_seconds: number;
  uptime_seconds: number;
  requests: number;
  model_loaded_at: number | null;
  model_load_seconds: number | null;
  idle_seconds: number | null;
  rss_mb: number | null;
  metal_active_mb: number | null;
  metal_peak_mb: number | null;
}

export interface WhisperMetrics {
  health: WhisperHealth;
}

export interface LaunchResult {
  ok: boolean;
  pid?: number;
  argv?: string[];
  log?: string;
  stopped?: boolean;
  output?: string;
}

export interface ActionOutput {
  ok: boolean;
  exit_code?: number;
  output?: string;
  result?: unknown;
}
