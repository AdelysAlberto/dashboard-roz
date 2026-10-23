import { useMutation } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { useLlmTestStore } from '../../../stores/useLlmTestStore';
import { LlmTestRequest } from '../../../types/llmTest';
import { draftToRequest } from '../utils';

/**
 * One probe against the endpoint. Running state lives in the store because the
 * button is in the right rail and the response panel is in the centre column.
 */
export function useLlmTestRun() {
  const beginRun = useLlmTestStore((state) => state.beginRun);
  const finishRun = useLlmTestStore((state) => state.finishRun);
  const setRun = useLlmTestStore((state) => state.setRun);
  const setError = useLlmTestStore((state) => state.setError);

  const mutation = useMutation({
    mutationFn: (request: LlmTestRequest) => api.runLlmTest(request),
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

  /** Resolves to `true` when a probe was sent. */
  const run = async (): Promise<boolean> => {
    try {
      await mutation.mutateAsync(draftToRequest(useLlmTestStore.getState().draft));
      return true;
    } catch {
      return false;
    }
  };

  return { run, isRunning: mutation.isPending };
}
