import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';

/**
 * Server-side seed for the form (endpoint, model, default master prompt,
 * device context). Read once per session: it comes from .env, not from the DB.
 */
export function useLlmTestDefaults() {
  return useQuery({
    queryKey: queryKeys.llmTestDefaults,
    queryFn: () => api.getLlmTestDefaults(),
    staleTime: Infinity,
  });
}
