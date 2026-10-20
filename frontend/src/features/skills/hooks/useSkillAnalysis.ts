import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { queryKeys } from '../../../services/queryKeys';
import { streamAnalysis } from '../../../services/skillStream';
import { stripAnalysisHeader } from '../../../utils/skills';

/**
 * Streams dell3-heretic's explanation of one SKILL.md.
 *
 * `text` is `null` until something is streamed, so the cached analysis from the
 * index is shown without an effect: the parent mounts this hook per skill
 * (`<SkillDetail key={skill.id} />`), which is what resets the buffer.
 */
export function useSkillAnalysis(skillId: string | null, cachedAnalysis: string) {
  const queryClient = useQueryClient();
  const [text, setText] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.skills });
    queryClient.invalidateQueries({ queryKey: queryKeys.skillDetail(skillId) });
  }, [queryClient, skillId]);

  const start = useCallback(
    async (force: boolean) => {
      if (!skillId || isStreaming) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setText('');
      setError(null);
      setIsStreaming(true);
      try {
        await streamAnalysis(
          { id: skillId, force },
          {
            onDelta: (delta) => setText((prev) => (prev ?? '') + delta),
            onDone: (payload) => {
              if (typeof payload.analysis === 'string' && payload.analysis) {
                setText(payload.analysis);
              }
            },
            onError: (message) => setError(message),
          },
          controller.signal
        );
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Analysis failed');
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        invalidate();
      }
    },
    [skillId, isStreaming, invalidate]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const value = text ?? cachedAnalysis;
  return {
    text: isStreaming ? stripAnalysisHeader(value) : value,
    isStreaming,
    error,
    start,
    stop,
  };
}
