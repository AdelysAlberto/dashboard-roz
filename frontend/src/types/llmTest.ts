/** oMLX turns the flag into chat_template_kwargs.enable_thinking. 'default'
 * omits it, so the server keeps its own per-model setting. */
export type LlmThinkingMode = 'default' | 'on' | 'off';

export interface LlmTestContext {
  latitude: string;
  longitude: string;
  vehicle: string;
  avoid_highways: boolean;
  avoid_tolls: boolean;
  prefer_curves: boolean;
}

/** What the rail edits. `max_tokens` stays a string: empty means "don't send it". */
export interface LlmTestDraft {
  api_url: string;
  api_key: string;
  model: string;
  temperature: number;
  max_tokens: string;
  thinking: LlmThinkingMode;
  reasoning_effort: string;
  thinking_budget: string;
  master_prompt: string;
  user_prompt: string;
  context: LlmTestContext;
}

/** What goes on the wire to /api/llm-test/{preview,run}. */
export interface LlmTestRequest {
  api_url: string;
  api_key: string;
  model: string;
  temperature: number;
  max_tokens: number | null;
  thinking: LlmThinkingMode;
  reasoning_effort: string;
  thinking_budget: string;
  master_prompt: string;
  user_prompt: string;
  context: LlmTestContext;
}

export interface LlmTestDefaults {
  api_url: string;
  model: string;
  has_key: boolean;
  temperature: number;
  timeout: number;
  master_prompt: string;
  context: {
    latitude: string;
    longitude: string;
    vehicle: string;
  };
}

export interface LlmTestUsage {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cached_tokens: number | null;
}

export interface LlmTestTimings {
  time_to_first_token: number | null;
  total_time: number | null;
  prompt_eval_duration: number | null;
  generation_duration: number | null;
  prompt_tokens_per_second: number | null;
  generation_tokens_per_second: number | null;
}

export interface LlmTestMeta {
  id: string | null;
  model: string | null;
  created: number | null;
  role: string | null;
  finish_reason: string | null;
  usage: LlmTestUsage;
  timings: LlmTestTimings;
}

export interface LlmTestRun {
  content: string;
  /** oMLX puts <think> output here, never inside `content`. */
  reasoning: string | null;
  /** The content decoded as JSON, when it was JSON at all. */
  parsed: unknown;
  parse_error: string | null;
  meta: LlmTestMeta;
  latency_ms: number;
  request: { url: string; payload: Record<string, unknown> };
  raw: Record<string, unknown>;
}

export interface LlmTestPreview {
  url: string;
  payload: Record<string, unknown>;
}
