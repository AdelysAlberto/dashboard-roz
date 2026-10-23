import { DocDetail, DocItem, StatusType, ValidationResult } from '../types/document';
import {
  CacheStats,
  InterruptResult,
  LatigazoAction,
  MonitorLogEvent,
  ServerConfig,
  SubagentSession,
} from '../types/pilot';
import {
  ServiceActionRequest,
  ServiceActionResult,
  ServiceDoc,
  ServiceSnapshot,
} from '../types/service';
import { SkillDetail, SkillsSnapshot } from '../types/skill';
import { LlmTestDefaults, LlmTestPreview, LlmTestRequest, LlmTestRun } from '../types/llmTest';
import {
  ImageTestDefaults,
  ImageTestPreview,
  ImageTestRequest,
  ImageTestRun,
} from '../types/imageTest';
import {
  ActionOutput,
  EngineLogs,
  EngineMetrics,
  EngineModels,
  EngineSettings,
  EngineTask,
  HfResult,
  KokoroSynthesis,
  KokoroVoices,
  LaunchResult,
} from '../types/engine';

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const err = await res.json();
      msg = err.detail || msg;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, msg);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Config
  getConfig: () => request<ServerConfig>('GET', '/api/config'),

  // Scan Roots
  getRoots: () => request<{ roots: string[] }>('GET', '/api/roots'),
  addRoot: (path: string) => request<{ root: string }>('POST', '/api/roots', { path }),
  deleteRoot: (path: string) => request<{ roots: string[] }>('DELETE', '/api/roots', { path }),

  // Documents
  getDocs: () => request<{ docs: DocItem[] }>('GET', '/api/docs'),
  getDoc: (path: string) => request<DocDetail>('GET', `/api/doc?path=${encodeURIComponent(path)}`),
  setStatus: (path: string, status: StatusType | string) =>
    request<DocItem>('POST', '/api/status', { path, status }),
  moveDoc: (path: string, dest: string) => request<DocItem>('POST', '/api/move', { path, dest }),
  deleteDoc: (path: string) => request<{ ok: boolean }>('POST', '/api/delete', { path }),

  // Validation
  validateDocs: () => request<ValidationResult>('GET', '/api/validate'),

  // Pilot / Analysis
  analyze: (payload: { path: string; prompt: string; agent?: string }) =>
    request<{ run_id: string }>('POST', '/api/analyze', payload),
  sendFollowup: (run_id: string, message: string) =>
    request<{ ok: boolean }>('POST', '/api/analyze/prompt', { run_id, message }),
  sendUiAnswer: (run_id: string, request_id: string, payload: Record<string, unknown>) =>
    request<{ ok: boolean }>('POST', '/api/analyze/answer', { run_id, request_id, payload }),
  getRunState: (run_id: string) =>
    request<{ exited: boolean; idle: boolean; events: number }>('GET', `/api/analyze/${run_id}/state`),
  closeRun: (run_id: string) => request<{ ok: boolean }>('POST', '/api/analyze/close', { run_id }),

  // Monitor
  getMonitorSessions: () =>
    request<{ sessions: SubagentSession[]; latigazo: LatigazoAction[] }>('GET', '/api/monitor/sessions'),
  getMonitorLog: (path: string, lines = 150) =>
    request<{ events: MonitorLogEvent[] }>('GET', `/api/monitor/log?path=${encodeURIComponent(path)}&lines=${lines}`),
  killSession: (path: string) => request<{ ok: boolean; pid: number }>('POST', '/api/monitor/wake', { path }),
  interruptSession: (path: string, level: 'tool' | 'turn' | 'kill') =>
    request<InterruptResult>('POST', '/api/monitor/interrupt', { path, level }),
  refreshMonitorCache: () =>
    request<{ ok: boolean; cache: CacheStats }>('POST', '/api/monitor/cache/refresh'),

  // Services
  getServices: () => request<ServiceSnapshot>('GET', '/api/services'),
  getServiceDocs: (id: string) =>
    request<ServiceDoc>('GET', `/api/services/docs?id=${encodeURIComponent(id)}`),
  runServiceAction: (payload: ServiceActionRequest) =>
    request<ServiceActionResult>('POST', '/api/services/action', payload),

  // Engine adapters (oMLX / Ollama / Splash)
  getEngineModels: (id: string) => request<EngineModels>('GET', `/api/engines/${id}/models`),
  engineModelAction: (id: string, model_id: string, op: 'load' | 'unload' | 'delete') =>
    request<ActionOutput>('POST', `/api/engines/${id}/models/action`, { model_id, op }),
  getEngineSettings: (id: string) => request<EngineSettings>('GET', `/api/engines/${id}/settings`),
  postEngineSettings: (id: string, patch: Record<string, unknown>) =>
    request<ActionOutput>('POST', `/api/engines/${id}/settings`, { patch }),
  getEngineMetrics: (id: string) => request<EngineMetrics>('GET', `/api/engines/${id}/metrics`),
  getEngineLogs: (id: string, lines = 120) =>
    request<EngineLogs>('GET', `/api/engines/${id}/logs?lines=${lines}`),
  hfSearch: (id: string, q: string) =>
    request<{ results: HfResult[] }>('GET', `/api/engines/${id}/hf/search?q=${encodeURIComponent(q)}`),
  hfDownload: (id: string, repo_id: string) =>
    request<ActionOutput>('POST', `/api/engines/${id}/hf/download`, { repo_id }),
  pullModel: (id: string, name: string) =>
    request<ActionOutput>('POST', `/api/engines/${id}/pull`, { name }),
  getEngineTasks: (id: string) => request<{ tasks: EngineTask[] }>('GET', `/api/engines/${id}/tasks`),
  getJobs: () => request<{ tasks: EngineTask[] }>('GET', '/api/engines/tasks'),
  restartEngine: (id: string) => request<ActionOutput>('POST', `/api/engines/${id}/restart`),
  launchEngine: (id: string, model: string, args: string[]) =>
    request<LaunchResult>('POST', `/api/engines/${id}/launch`, { model, args }),
  engineServerOp: (id: string, op: 'start' | 'stop') =>
    request<ActionOutput>('POST', `/api/engines/${id}/server`, { op }),

  // Skills (agent SKILL.md index)
  getSkills: () => request<SkillsSnapshot>('GET', '/api/skills'),
  getSkillDetail: (id: string) =>
    request<SkillDetail>('GET', `/api/skills/detail?id=${encodeURIComponent(id)}`),
  setSkillTags: (payload: { id: string; category?: string; tags?: string[] }) =>
    request<{ entry: Record<string, unknown> }>('POST', '/api/skills/tags', payload),
  skillDeepDive: (id: string, agent: string) =>
    request<{ run_id: string; path: string }>('POST', '/api/skills/deepdive', { id, agent }),

  // Test IA (prompt lab)
  getLlmTestDefaults: () => request<LlmTestDefaults>('GET', '/api/llm-test/defaults'),
  previewLlmTest: (payload: LlmTestRequest) =>
    request<LlmTestPreview>('POST', '/api/llm-test/preview', payload),
  runLlmTest: (payload: LlmTestRequest) =>
    request<LlmTestRun>('POST', '/api/llm-test/run', payload),

  // Test Imagen (diffusion lab)
  getImageTestDefaults: () => request<ImageTestDefaults>('GET', '/api/image-test/defaults'),
  previewImageTest: (payload: ImageTestRequest) =>
    request<ImageTestPreview>('POST', '/api/image-test/preview', payload),
  generateImageTest: (payload: ImageTestRequest) =>
    request<ImageTestRun>('POST', '/api/image-test/generate', payload),

  // Kokoro (voces)
  getKokoroVoices: (id: string) => request<KokoroVoices>('GET', `/api/engines/${id}/voices`),
  kokoroSynthesize: (id: string, payload: { text: string; voice?: string; speed?: number }) =>
    request<KokoroSynthesis>('POST', `/api/engines/${id}/synthesize`, payload),
  kokoroSetDefaultVoice: (id: string, voice: string) =>
    request<{ ok: boolean; default_voice: string }>('POST', `/api/engines/${id}/default-voice`, {
      voice,
    }),
};
