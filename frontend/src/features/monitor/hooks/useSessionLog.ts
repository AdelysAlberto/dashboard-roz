import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';

export function useSessionLog(path: string | null) {
  return useQuery({
    queryKey: queryKeys.monitorLog(path),
    queryFn: async () => {
      if (!path) return [];
      const res = await api.getMonitorLog(path, 150);
      return res.events;
    },
    enabled: Boolean(path),
    refetchInterval: (query) => (query.state.data ? 2500 : false),
  });
}
