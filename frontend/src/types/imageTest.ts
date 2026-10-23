/** Aspect ratios the lab offers. The pixel pairs behind them are the Qwen-Image
 * model card buckets (1328², 1664x928, 928x1664). */
export type ImageOrientation = '1:1' | '16:9' | '9:16';

/** `auto` reads the URL: an sdapi path means Automatic1111, /v1 means OpenAI. */
export type ImageBackend = 'auto' | 'a1111' | 'openai';

/** What the rail edits. Numbers stay strings: empty means "send the default". */
export interface ImageTestDraft {
  api_url: string;
  api_key: string;
  backend: ImageBackend;
  model: string;
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
