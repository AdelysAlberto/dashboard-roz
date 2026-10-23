import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';
import { useLlmTestStore } from '../../../stores/useLlmTestStore';
import { draftToRequest, withoutKey } from '../utils';

/**
 * The exact body Roz would send, without spending a model call. Only fetched
 * once the operator opens the panel: it is an audit view, not a live gauge.
 */
export function useLlmTestPreview(enabled: boolean) {
  const draft = useLlmTestStore((state) => state.draft);
  const request = useMemo(() => withoutKey(draftToRequest(draft)), [draft]);
  const urlReady = /^https?:\/\//i.test(request.api_url);

  return useQuery({
    queryKey: queryKeys.llmTestPreview(request),
    queryFn: () => api.previewLlmTest(request),
    enabled: enabled && urlReady,
    retry: false,
    staleTime: 5_000,
  });
}
