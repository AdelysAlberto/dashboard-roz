import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';

export function useDocuments() {
  return useQuery({
    queryKey: queryKeys.docs,
    queryFn: async () => {
      const res = await api.getDocs();
      return res.docs;
    },
    staleTime: 1000 * 30, // 30 seconds
  });
}
