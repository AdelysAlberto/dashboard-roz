import {
  LlmTestContext,
  LlmTestDefaults,
  LlmTestDraft,
  LlmTestRequest,
  LlmTestRun,
} from '../../types/llmTest';

/** String field of a draft: the persisted blob is untrusted, an old one may
 * predate the field entirely, so never call a method on it directly. */
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Draft (strings from the inputs) -> the JSON body the server expects. */export function draftToRequest(draft: LlmTestDraft): LlmTestRequest {
  const raw = text(draft.max_tokens);
  const maxTokens = raw === '' ? Number.NaN : Number(raw);
  return {
    api_url: text(draft.api_url),
    api_key: text(draft.api_key),
    model: text(draft.model),
    temperature: draft.temperature,
    max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : null,
    thinking: draft.thinking ?? 'default',
    reasoning_effort: text(draft.reasoning_effort),
    thinking_budget: text(draft.thinking_budget),
    master_prompt: draft.master_prompt ?? '',
    user_prompt: draft.user_prompt ?? '',
    context: draft.context,
  };
}

/** The preview is a dry run: the key has no business leaving the browser. */
export function withoutKey(request: LlmTestRequest): LlmTestRequest {
  return { ...request, api_key: '' };
}

export function urlError(raw: string): string | null {
  const url = raw.trim();
  if (!url) return 'The endpoint is required.';
  if (!/^https?:\/\//i.test(url)) return 'Must start with http:// or https://';
  return null;
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)} s`;
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** Machine timestamps arrive as unix seconds; humans read local time. */
export function formatCreated(created: number | null): string {
  if (!created) return '—';
  return new Date(created * 1000).toLocaleString();
}

/** What the operator reads in the content block: raw bytes or the re-printed JSON. *//**
 * Seed values from the server for the blank fields of a draft.
 *
 * Blanks only, never overwrites: a value the operator typed, or one left in
 * localStorage by an earlier run, is a choice and the .env default is not
 * allowed to undo it. `null` marks a field that already has a value.
 */
export function seedFromDefaults(
  draft: LlmTestDraft,
  defaults: LlmTestDefaults,
): Partial<Omit<LlmTestDraft, 'context'>> {
  return {
    api_url: draft.api_url || defaults.api_url,
    model: draft.model || defaults.model,
    master_prompt: draft.master_prompt || defaults.master_prompt,
    temperature: draft.temperature || defaults.temperature,
  };
}

/**
 * The whole draft replaced by the server defaults: what "Use server defaults"
 * does. The key stays untouched (it never lives in the browser) and the user
 * prompt survives, because the .env has nothing to offer for it.
 */
export function serverDefaultsPatch(
  draft: LlmTestDraft,
  defaults: LlmTestDefaults,
): { fields: Partial<Omit<LlmTestDraft, 'context'>>; context: Partial<LlmTestContext> } {
  return {
    fields: {
      api_url: defaults.api_url,
      model: defaults.model,
      master_prompt: defaults.master_prompt,
      temperature: defaults.temperature,
      max_tokens: '',
      thinking: 'default',
      reasoning_effort: '',
      thinking_budget: '',
      user_prompt: draft.user_prompt,
    },
    context: {
      latitude: defaults.context.latitude,
      longitude: defaults.context.longitude,
      vehicle: defaults.context.vehicle,
    },
  };
}

export function renderContent(run: LlmTestRun, pretty: boolean): string {
  if (pretty && run.parsed !== null && run.parsed !== undefined) {
    return JSON.stringify(run.parsed, null, 2);
  }
  return run.content;
}

export function isJsonParsed(run: LlmTestRun): boolean {
  return run.parsed !== null && run.parsed !== undefined;
}

export function contextSummary(context: LlmTestContext): string {
  const preferences =
    [
      context.avoid_highways ? 'no highways' : null,
      context.avoid_tolls ? 'no tolls' : null,
      context.prefer_curves ? 'curvy' : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'no preferences';
  return [
    `${context.latitude || '0'}, ${context.longitude || '0'}`,
    context.vehicle || 'unknown vehicle',
    preferences,
  ].join(' · ');
}
