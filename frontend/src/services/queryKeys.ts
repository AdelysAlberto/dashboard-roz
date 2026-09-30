export const queryKeys = {
  config: ['config'] as const,
  roots: ['roots'] as const,
  docs: ['docs'] as const,
  doc: (path: string | null) => ['doc', path] as const,
  validate: ['validate'] as const,
  monitorSessions: ['monitor', 'sessions'] as const,
  monitorLog: (path: string | null) => ['monitor', 'log', path] as const,
};
