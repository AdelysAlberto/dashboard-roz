import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';
import { useToastStore } from '../../../stores/useToastStore';
import { InterruptLevel } from '../../../types/pilot';

const LABELS: Record<InterruptLevel, string> = {
  tool: 'Tool cut, the turn resumes',
  turn: 'Turn aborted, session kept',
  kill: 'Session terminated',
};

/**
 * Latigazo ladder. `tool` cuts the process of the tool call in flight and the
 * agent continues with a failed result; `turn` aborts the agent turn keeping
 * the session; `kill` terminates the agent process.
 */
export function useLatigazo(path: string) {
  const queryClient = useQueryClient();
  const toast = useToastStore();

  const mutation = useMutation({
    mutationFn: async (level: InterruptLevel) => api.interruptSession(path, level),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.monitorSessions });
      queryClient.invalidateQueries({ queryKey: queryKeys.monitorLog(path) });
      if (res.ok) toast.success(LABELS[res.level as InterruptLevel] ?? res.level, res.detail);
      else toast.warning(res.detail, 'Latigazo sin efecto');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Latigazo failed');
    },
  });

  return {
    cut: mutation.mutate,
    pendingLevel: mutation.isPending ? (mutation.variables ?? null) : null,
    isPending: mutation.isPending,
  };
}
