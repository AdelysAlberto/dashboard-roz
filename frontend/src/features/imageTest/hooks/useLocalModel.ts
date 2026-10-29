import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';
import { useToastStore } from '../../../stores/useToastStore';
import { LocalModelStatus, LocalWorkerState } from '../../../types/imageTest';

const BUSY: LocalWorkerState[] = ['loading', 'generating'];

/** How often to ask. A resident worker changes state on its own thread, so the
 * form cannot rely on the response of the action that started it. */
const POLL_BUSY_MS = 2000;
const POLL_IDLE_MS = 15000;

/** Checkpoints found under ROZ_IMAGE_TEST_MODELS_DIR, compatible ones first. */
export function useLocalModels() {
  return useQuery({
    queryKey: queryKeys.imageLocalModels,
    queryFn: () => api.getLocalImageModels(),
    staleTime: 30_000,
  });
}

/**
 * Worker state: the only source of truth for "is the model loaded". Polls
 * faster while something is happening and lazily otherwise.
 */
export function useLocalModelStatus() {
  return useQuery({
    queryKey: queryKeys.imageLocalStatus,
    queryFn: () => api.getLocalImageStatus(),
    staleTime: 1000,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state && BUSY.includes(state) ? POLL_BUSY_MS : POLL_IDLE_MS;
    },
  });
}

/** Load / unload. Both answer with the fresh status, which is cached directly:
 * the load returns while the weights are still loading. */
export function useLocalModelActions() {
  const client = useQueryClient();
  const info = useToastStore((state) => state.info);
  const error = useToastStore((state) => state.error);

  const store = (status: LocalModelStatus) => {
    client.setQueryData(queryKeys.imageLocalStatus, status);
    void client.invalidateQueries({ queryKey: queryKeys.imageLocalModels });
  };

  const load = useMutation({
    mutationFn: (path: string) => api.loadLocalImageModel(path),
    onSuccess: (status) => {
      store(status);
      info(`Loading ${status.name ?? 'checkpoint'}… mflux materialises the weights first.`);
    },
    onError: (failure: Error) => {
      error(failure.message, 'The model could not load');
      void client.invalidateQueries({ queryKey: queryKeys.imageLocalStatus });
    },
  });

  const unload = useMutation({
    mutationFn: () => api.unloadLocalImageModel(),
    onSuccess: (status) => {
      store(status);
      info('Model unloaded: the worker released the weights.');
    },
    onError: (failure: Error) => error(failure.message, 'The model could not unload'),
  });

  return {
    load: load.mutate,
    unload: unload.mutate,
    isWorking: load.isPending || unload.isPending,
  };
}
