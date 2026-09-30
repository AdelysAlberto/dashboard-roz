import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';

export function useValidation(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.validate,
    queryFn: api.validateDocs,
    enabled,
    staleTime: 0,
  });
}
