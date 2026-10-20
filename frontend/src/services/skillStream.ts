import { SkillChatMessage, SkillStreamDone } from '../types/skill';

/** Server-Sent Events consumer for the skills endpoints (analyze / chat). */

interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone: (payload: SkillStreamDone) => void;
  onError: (message: string) => void;
}

type StreamEvent =
  | { type: 'start' }
  | { type: 'delta'; text: string }
  | ({ type: 'done' } & SkillStreamDone)
  | { type: 'error'; message: string };

function dispatch(raw: string, handlers: StreamHandlers): void {
  let event: StreamEvent;
  try {
    event = JSON.parse(raw) as StreamEvent;
  } catch {
    return;
  }
  if (event.type === 'delta' && typeof event.text === 'string') {
    handlers.onDelta(event.text);
  } else if (event.type === 'done') {
    handlers.onDone(event);
  } else if (event.type === 'error') {
    handlers.onError(event.message || 'The model call failed');
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string };
    return body.detail || res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function streamSkills(
  endpoint: '/api/skills/analyze' | '/api/skills/chat',
  body: unknown,
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    handlers.onError(await readError(res));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        const parsed = JSON.parse(payload) as StreamEvent;
        if (parsed.type === 'done') finished = true;
        dispatch(payload, handlers);
      }
      boundary = buffer.indexOf('\n\n');
    }
  }
}

export interface AnalyzeStreamArgs {
  id: string;
  force: boolean;
}

export function streamAnalysis(
  args: AnalyzeStreamArgs,
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  return streamSkills('/api/skills/analyze', args, handlers, signal);
}

export function streamChat(
  id: string,
  messages: SkillChatMessage[],
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  return streamSkills('/api/skills/chat', { id, messages }, handlers, signal);
}
