import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';

/**
 * Server-side seed for the form (endpoint, model, steps, guidance, master
 * prompt, output dir). Read once per session: it comes from .env, not the DB.
 */
export function useImageTestDefaults() {
  return useQuery({
    queryKey: queryKeys.imageTestDefaults,
    queryFn: () => api.getImageTestDefaults(),
    staleTime: Infinity,
  });
}
