import { useMutation } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { useImageTestStore } from '../../../stores/useImageTestStore';
import { ImageTestRequest } from '../../../types/imageTest';
import { draftToRequest } from '../utils';

/**
 * One generation. The running state lives in the store because the button is in
 * the rail and the result panel is in the centre column. A diffusion step on a
 * local Mac takes seconds, so the panel needs a clock, not a spinner alone.
 */
export function useImageTestRun() {
  const beginRun = useImageTestStore((state) => state.beginRun);
  const finishRun = useImageTestStore((state) => state.finishRun);
  const setRun = useImageTestStore((state) => state.setRun);
  const setError = useImageTestStore((state) => state.setError);

  const mutation = useMutation({
    mutationFn: (request: ImageTestRequest) => api.generateImageTest(request),
    onMutate: () => {
      beginRun();
    },
    onSuccess: (data) => {
      setRun(data);
    },
    onError: (error: Error) => {
      setError(error.message);
    },
    onSettled: () => {
      finishRun();
    },
  });

  /** Resolves to `true` when a generation was requested. */
  const run = async (): Promise<boolean> => {
    try {
      await mutation.mutateAsync(draftToRequest(useImageTestStore.getState().draft));
      return true;
    } catch {
      return false;
    }
  };

  return { run, isRunning: mutation.isPending };
}
