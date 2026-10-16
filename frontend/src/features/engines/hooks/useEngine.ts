import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';
import { ActionOutput } from '../../../types/engine';

/** Acción tipada por motor: cada adapter del backend decide si la soporta. */
export type EngineAction =
  | { kind: 'model'; model_id: string; op: 'load' | 'unload' | 'delete' }
  | { kind: 'settings'; patch: Record<string, unknown> }
  | { kind: 'download'; repo_id: string }
  | { kind: 'pull'; name: string }
  | { kind: 'restart' }
  | { kind: 'launch'; model: string; args: string[] }
  | { kind: 'server'; op: 'start' | 'stop' };

export function useEngineModels(id: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.engineModels(id),
    queryFn: () => api.getEngineModels(id as string),
    enabled: enabled && Boolean(id),
    refetchInterval: 6000,
  });
}

export function useEngineSettings(id: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.engineSettings(id),
    queryFn: () => api.getEngineSettings(id as string),
    enabled: enabled && Boolean(id),
    staleTime: 15_000,
  });
}

export function useEngineMetrics(id: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.engineMetrics(id),
    queryFn: () => api.getEngineMetrics(id as string),
    enabled: enabled && Boolean(id),
    refetchInterval: 10_000,
  });
}

export function useEngineLogs(id: string | null, lines = 120, enabled = true) {
  return useQuery({
    queryKey: queryKeys.engineLogs(id, lines),
    queryFn: () => api.getEngineLogs(id as string, lines),
    enabled: enabled && Boolean(id),
    refetchInterval: 10_000,
  });
}

/** Kokoro: catálogo de voces + la que es por defecto ahora mismo. */
export function useKokoroVoices(id: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.engineVoices(id),
    queryFn: () => api.getKokoroVoices(id as string),
    enabled: enabled && Boolean(id),
    staleTime: 30_000,
  });
}

/** Tareas del motor (descargas de oMLX) + las locales de Roz (pulls de Ollama). */
export function useEngineTasks(id: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.engineTasks(id),
    queryFn: async () => {
      const [remote, jobs] = await Promise.allSettled([
        api.getEngineTasks(id as string),
        api.getJobs(),
      ]);
      const remoteTasks = remote.status === 'fulfilled' ? remote.value.tasks : [];
      const localTasks = jobs.status === 'fulfilled' ? jobs.value.tasks : [];
      return { remote: remoteTasks, local: localTasks.filter((t) => t.kind === 'ollama-pull') };
    },
    enabled: enabled && Boolean(id),
    refetchInterval: 3000,
  });
}

export function useHfSearch(id: string | null, query: string) {
  return useQuery({
    queryKey: queryKeys.hfSearch(id, query),
    queryFn: () => api.hfSearch(id as string, query),
    enabled: Boolean(id) && query.trim().length >= 2,
    staleTime: 60_000,
  });
}

export function useEngineAction(id: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (action: EngineAction): Promise<ActionOutput | { ok: boolean }> => {
      switch (action.kind) {
        case 'model':
          return api.engineModelAction(id, action.model_id, action.op);
        case 'settings':
          return api.postEngineSettings(id, action.patch);
        case 'download':
          return api.hfDownload(id, action.repo_id);
        case 'pull':
          return api.pullModel(id, action.name);
        case 'restart':
          return api.restartEngine(id);
        case 'launch':
          return api.launchEngine(id, action.model, action.args);
        case 'server':
          return api.engineServerOp(id, action.op);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.engineModels(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.engineSettings(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.engineMetrics(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.engineTasks(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.services });
    },
  });

  return { run: mutation.mutateAsync, isPending: mutation.isPending };
}
