import {
  ImageBackend,
  ImageTestDefaults,
  ImageTestDraft,
  ImageTestRequest,
  ImageTestRun,
  LocalLastRun,
} from '../../types/imageTest';

export const BACKEND_OPTIONS: { value: ImageBackend; label: string }[] = [
  { value: 'auto', label: 'Auto (from URL)' },
  { value: 'a1111', label: 'A1111 / sdapi' },
  { value: 'openai', label: 'OpenAI /v1/images' },
  { value: 'local', label: 'Local (mflux)' },
];

/** String field of a draft: the persisted blob is untrusted, never call a method
 * on it directly. */
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberOr(value: unknown, fallback: number): number {
  const raw = text(value);
  const parsed = Number(raw);
  return raw !== '' && Number.isFinite(parsed) ? parsed : fallback;
}

/** Draft (strings from the inputs) -> the JSON body the server expects. */
export function draftToRequest(draft: ImageTestDraft): ImageTestRequest {
  return {
    api_url: text(draft.api_url),
    api_key: text(draft.api_key),
    backend: draft.backend ?? 'auto',
    model: text(draft.model),
    local_path: text(draft.local_path),
    steps: numberOr(draft.steps, 50),
    guidance: numberOr(draft.guidance, 4),
    seed: text(draft.seed),
    orientation: draft.orientation ?? '1:1',
    negative_prompt: text(draft.negative_prompt),
    master_prompt: draft.master_prompt ?? '',
    user_prompt: draft.user_prompt ?? '',
  };
}

/** The preview is a dry run: the key has no business leaving the browser. */
export function withoutKey(request: ImageTestRequest): ImageTestRequest {
  return { ...request, api_key: '' };
}

/**
 * Seed values from the server for the blank fields of a draft. Blanks only: a
 * value the operator typed is a choice, and the .env default must not undo it.
 */
export function seedFromDefaults(
  draft: ImageTestDraft,
  defaults: ImageTestDefaults,
): Partial<ImageTestDraft> {
  return {
    api_url: draft.api_url || defaults.api_url,
    model: draft.model || defaults.model,
    backend: draft.backend || defaults.backend,
    local_path: draft.local_path || defaults.local_model_path,
    master_prompt: draft.master_prompt || defaults.master_prompt,
    orientation: draft.orientation || (defaults.orientation as ImageTestDraft['orientation']),
  };
}

/**
 * The draft replaced by the server defaults: what "Use server defaults" does.
 * The key is untouched (it never lives in the browser) and the subject survives,
 * because the .env has nothing to offer for it.
 */
export function serverDefaultsPatch(
  draft: ImageTestDraft,
  defaults: ImageTestDefaults,
): Partial<ImageTestDraft> {
  return {
    api_url: defaults.api_url,
    model: defaults.model,
    backend: defaults.backend,
    local_path: defaults.local_model_path,
    steps: String(defaults.steps),
    guidance: String(defaults.guidance),
    orientation: defaults.orientation as ImageTestDraft['orientation'],
    master_prompt: defaults.master_prompt,
    seed: '',
    user_prompt: draft.user_prompt,
  };
}

export function urlError(raw: string): string | null {
  const url = raw.trim();
  if (!url) return 'The endpoint is required.';
  if (!/^https?:\/\//i.test(url)) return 'Must start with http:// or https://';
  return null;
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** PNG the server wrote to disk. The browser downloads those exact bytes. */
export function fileUrl(name: string): string {
  return `/api/image-test/file/${encodeURIComponent(name)}`;
}

export function dataUrl(b64: string): string {
  return `data:image/png;base64,${b64}`;
}

/** A finished local run, back into the shape the result panel renders. The
 * image itself is not in the payload: `image_b64` stays empty and the card
 * falls back to the file URL, which is the same PNG. */
export function runFromLastRun(last: LocalLastRun): ImageTestRun {
  return {
    image_b64: '',
    image_name: last.image_name,
    image_bytes: last.image_bytes,
    meta: last.meta,
    latency_ms: last.latency_ms,
    request: last.request,
    raw: last.raw,
  };
}

/** Strip the directory, keep the file: the full path is metadata, the name is
 * what the download button needs. */
export function baseName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/** Folder name of a checkpoint: the path is long and the rail is narrow. */
export function modelFolderName(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return baseName(trimmed) || path;
}

export function isLocalBackend(backend: string): boolean {
  return backend === 'local';
}

/** Two folder paths that mean the same checkpoint. The server answers with a
 * resolved absolute path while the rail may carry a trailing slash. */
export function samePath(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  const clean = (value: string) => value.trim().replace(/\/+$/, '');
  return clean(left) === clean(right);
}
