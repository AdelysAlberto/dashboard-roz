import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';

export function useDocumentDetail(path: string | null) {
  return useQuery({
    queryKey: queryKeys.doc(path),
    queryFn: async () => {
      if (!path) return null;
      return api.getDoc(path);
    },
    enabled: Boolean(path),
    staleTime: 1000 * 10,
  });
}
