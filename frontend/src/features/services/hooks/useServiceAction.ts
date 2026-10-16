import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';
import { ServiceActionRequest, ServiceActionResult } from '../../../types/service';

/** Runs a server-resolved action (start/stop/restart or a manifest action). */
export function useServiceAction() {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<ServiceActionResult | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ServiceActionRequest) => api.runServiceAction(payload),
    onSuccess: (data) => {
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.services });
    },
  });

  return {
    run: mutation.mutateAsync,
    isPending: mutation.isPending,
    result,
  };
}
