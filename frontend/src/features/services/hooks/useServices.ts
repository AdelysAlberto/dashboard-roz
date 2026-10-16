import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';

export function useServices() {
  return useQuery({
    queryKey: queryKeys.services,
    queryFn: async () => api.getServices(),
    refetchInterval: 5000,
  });
}

/** Docs are expensive to render: only fetched once the user expands them. */
export function useServiceDocs(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.serviceDocs(id),
    queryFn: async () => api.getServiceDocs(id as string),
    enabled: enabled && Boolean(id),
    staleTime: 30_000,
  });
}
