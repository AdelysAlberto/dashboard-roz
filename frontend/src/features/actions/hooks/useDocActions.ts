import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';
import { useDocSelectionStore } from '../../../stores/useDocSelectionStore';
import { useToastStore } from '../../../stores/useToastStore';
import { StatusType } from '../../../types/document';

export function useDocActions() {
  const queryClient = useQueryClient();
  const updateSelectedMeta = useDocSelectionStore((state) => state.updateSelectedMeta);
  const selectDoc = useDocSelectionStore((state) => state.selectDoc);
  const toast = useToastStore();

  const statusMutation = useMutation({
    mutationFn: async ({ path, status }: { path: string; status: StatusType | string }) => {
      return api.setStatus(path, status);
    },
    onSuccess: (updatedDoc, { status }) => {
      updateSelectedMeta(updatedDoc);
      queryClient.invalidateQueries({ queryKey: queryKeys.docs });
      queryClient.invalidateQueries({ queryKey: queryKeys.doc(updatedDoc.path) });
      toast.success(`Status updated to ${status}`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({ path, dest }: { path: string; dest: string }) => {
      return api.moveDoc(path, dest);
    },
    onSuccess: (movedDoc) => {
      selectDoc(movedDoc);
      queryClient.invalidateQueries({ queryKey: queryKeys.docs });
      queryClient.invalidateQueries({ queryKey: queryKeys.doc(movedDoc.path) });
      toast.success(`Moved to ${movedDoc.path}`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to move document');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (path: string) => {
      return api.deleteDoc(path);
    },
    onSuccess: () => {
      selectDoc(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.docs });
      toast.success('Document deleted');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to delete document');
    },
  });

  return {
    statusMutation,
    moveMutation,
    deleteMutation,
  };
}
