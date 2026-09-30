import { DocDetail, DocItem, StatusType, ValidationResult } from '../types/document';
import { MonitorLogEvent, ServerConfig, SubagentSession } from '../types/pilot';

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
  getMonitorSessions: () => request<{ sessions: SubagentSession[] }>('GET', '/api/monitor/sessions'),
  getMonitorLog: (path: string, lines = 150) =>
    request<{ events: MonitorLogEvent[] }>('GET', `/api/monitor/log?path=${encodeURIComponent(path)}&lines=${lines}`),
  killSession: (path: string) => request<{ ok: boolean; pid: number }>('POST', '/api/monitor/wake', { path }),
};
