import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';
import { storage } from '../../../services/storage';
import { useToastStore } from '../../../stores/useToastStore';

export function useScanPaths() {
  const queryClient = useQueryClient();
  const toast = useToastStore();
  const [recentPaths, setRecentPaths] = useState<string[]>(() => storage.getRecentPaths());

  const rootsQuery = useQuery({
    queryKey: queryKeys.roots,
    queryFn: async () => {
      const res = await api.getRoots();
      return res.roots;
    },
  });

  const addRootMutation = useMutation({
    mutationFn: async (path: string) => {
      const res = await api.addRoot(path);
      storage.saveRecentPath(path);
      setRecentPaths(storage.getRecentPaths());
      return res.root;
    },
    onSuccess: (newRoot) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roots });
      queryClient.invalidateQueries({ queryKey: queryKeys.docs });
      toast.success(`Scan path added: ${newRoot}`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to add scan path');
    },
  });

  const deleteRootMutation = useMutation({
    mutationFn: async (path: string) => {
      return api.deleteRoot(path);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roots });
      queryClient.invalidateQueries({ queryKey: queryKeys.docs });
      toast.success('Scan path removed');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to remove scan path');
    },
  });

  const clearRecentPath = (path: string) => {
    storage.removeRecentPath(path);
    setRecentPaths(storage.getRecentPaths());
  };

  return {
    roots: rootsQuery.data || [],
    isLoading: rootsQuery.isLoading,
    recentPaths,
    addRootMutation,
    deleteRootMutation,
    clearRecentPath,
  };
}
