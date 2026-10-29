/** Aspect ratios the lab offers. The pixel pairs behind them are the Qwen-Image
 * model card buckets (1328², 1664x928, 928x1664). */
export type ImageOrientation = '1:1' | '16:9' | '9:16';

/** `auto` reads the URL: an sdapi path means Automatic1111, /v1 means OpenAI.
 * `local` skips HTTP entirely: roz loads the checkpoint itself through mflux. */
export type ImageBackend = 'auto' | 'a1111' | 'openai' | 'local';

/** What the rail edits. Numbers stay strings: empty means "send the default". */
export interface ImageTestDraft {
  api_url: string;
  api_key: string;
  backend: ImageBackend;
  model: string;
  /** Folder of the local checkpoint (mflux backend only). */
  local_path: string;
  steps: string;
  guidance: string;
  seed: string;
  orientation: ImageOrientation;
  negative_prompt: string;
  master_prompt: string;
  user_prompt: string;
}

/** What goes on the wire to /api/image-test/{preview,generate}. */
export interface ImageTestRequest {
  api_url: string;
  api_key: string;
  backend: ImageBackend;
  model: string;
  local_path: string;
  steps: number;
  guidance: number;
  seed: string;
  orientation: ImageOrientation;
  negative_prompt: string;
  master_prompt: string;
  user_prompt: string;
}

export interface ImageTestDefaults {
  api_url: string;
  model: string;
  backend: ImageBackend;
  has_key: boolean;
  steps: number;
  guidance: number;
  orientation: string;
  master_prompt: string;
  timeout: number;
  out_dir: string;
  local_model_path: string;
  models_dir: string;
  mflux_python: string;
  mflux_available: boolean;
}

export interface ImageTestMeta {
  backend: string;
  model: string | null;
  seed: number | null;
  steps: number | null;
  guidance: number | null;
  /** [width, height] as they were sent, or [null, null] for a backend that ignores them. */
  size: (number | null)[];
  saved_path: string;
}

export interface ImageTestRun {
  /** PNG, base64. The same bytes as `saved_path`: the preview is never a re-encode. */
  image_b64: string;
  image_name: string;
  image_bytes: number;
  meta: ImageTestMeta;
  latency_ms: number;
  request: { url: string; payload: Record<string, unknown> };
  raw: Record<string, unknown>;
}

export interface ImageTestPreview {
  url: string;
  backend: string;
  payload: Record<string, unknown>;
  size: number[];
}

/** One checkpoint the worker could load, as the server inspects it. */
export interface LocalModelInfo {
  path: string;
  name: string;
  compatible: boolean;
  /** Why it cannot run, empty when it can. */
  reason: string;
  size_bytes: number;
  family: string | null;
  default: boolean;
}

export interface LocalModelsPayload {
  root: string;
  models: LocalModelInfo[];
  python: string;
  available: boolean;
  default_path: string;
}

/** The last finished image, as the server remembers it. No base64: the PNG is
 * fetched from /api/image-test/file/{name}, which is the same file. */
export interface LocalLastRun {
  image_name: string;
  image_bytes: number;
  meta: ImageTestMeta;
  latency_ms: number;
  request: { url: string; payload: Record<string, unknown> };
  raw: Record<string, unknown>;
  finished_at: string;
}

/** `idle` and `error` are the only two without a worker holding weights. */
export type LocalWorkerState = 'idle' | 'loading' | 'ready' | 'generating' | 'error';

export interface LocalModelStatus {
  state: LocalWorkerState;
  /** `loading` / `warmup` while the weights materialise, null otherwise. */
  phase: string | null;
  path: string | null;
  name: string | null;
  /** `qwen-image` (2512) or `qwen-image-2.1`; mflux loads each with its own class. */
  family: string | null;
  error: string | null;
  warning: string | null;
  bits: number | null;
  load_ms: number | null;
  warmup: boolean | null;
  warmup_ms: number | null;
  generation_ms: number | null;
  seed: number | null;
  loaded_at: string | null;
  /** ISO local time the running generation started; survives a page reload. */
  started_at: string | null;
  /** How long the running generation has been going, at the moment of the poll. */
  elapsed_ms: number | null;
  /** Latest finished image, so a reload does not lose the result. */
  last_run: LocalLastRun | null;
  out_dir: string;
  pid: number | null;
  python: string;
  available: boolean;
  default_path: string;
  loaded: boolean;
}
