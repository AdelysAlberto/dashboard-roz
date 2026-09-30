import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';

export function useMonitorSessions() {
  return useQuery({
    queryKey: queryKeys.monitorSessions,
    queryFn: async () => {
      const res = await api.getMonitorSessions();
      return res.sessions;
    },
    refetchInterval: 4000,
  });
}
