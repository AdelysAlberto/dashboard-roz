import { useCallback, useRef, useState } from 'react';
import { streamChat } from '../../../services/skillStream';
import { SkillChatMessage } from '../../../types/skill';

/**
 * Conversational Q&A about one skill. History lives here; the parent remounts
 * this hook per skill (`key={skill.id}`), which clears the conversation.
 */
export function useSkillChat(skillId: string) {
  const [messages, setMessages] = useState<SkillChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || isStreaming) return;

      const history: SkillChatMessage[] = [...messages, { role: 'user', content: question }];
      setMessages([...history, { role: 'assistant', content: '' }]);
      setError(null);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;
      const append = (delta: string) =>
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== 'assistant') return prev;
          return [...prev.slice(0, -1), { ...last, content: last.content + delta }];
        });

      try {
        await streamChat(
          skillId,
          history,
          {
            onDelta: append,
            onDone: () => undefined,
            onError: (message) => setError(message),
          },
          controller.signal
        );
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'The chat request failed');
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [skillId, messages, isStreaming]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setError(null);
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, error, send, stop, clear };
}
