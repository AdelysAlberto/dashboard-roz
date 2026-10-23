import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';
import { useToastStore } from '../../../stores/useToastStore';

/**
 * Drops the server-side transcript cache. Listing 275 sessions re-reads ~140 MB
 * of JSONL on a cold pass, so this is the escape hatch for a session that looks
 * stale, not something to press on every poll.
 */
export function useRefreshMonitorCache() {
  const queryClient = useQueryClient();
  const toast = useToastStore();

  const mutation = useMutation({
    mutationFn: async () => api.refreshMonitorCache(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.monitorSessions });
      toast.success(`Cache dropped · ${res.cache.entries} entries rebuilt`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to refresh the session cache');
    },
  });

  return {
    refreshCache: mutation.mutate,
    isRefreshing: mutation.isPending,
  };
}
