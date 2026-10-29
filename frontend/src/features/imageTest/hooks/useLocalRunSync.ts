import { useEffect, useRef } from 'react';
import { useImageTestStore } from '../../../stores/useImageTestStore';
import { LocalLastRun } from '../../../types/imageTest';
import { runFromLastRun } from '../utils';
import { useLocalModelStatus } from './useLocalModel';

/**
 * A generation outlives the request that started it: reload the page and the
 * POST dies, but the worker keeps denoising and the PNG still lands on disk.
 * The status carries both ends of that — the running start time and the last
 * finished run — so the pane can show the clock and then the image again.
 */
export function useLocalRunSync() {
  const { data: status } = useLocalModelStatus();
  const seen = useRef<string | null>(null);

  const last: LocalLastRun | null = status?.last_run ?? null;
  const finishedAt = last?.finished_at ?? null;

  useEffect(() => {
    if (!last || !finishedAt || seen.current === finishedAt) return;
    seen.current = finishedAt;
    const state = useImageTestStore.getState();
    if (state.run?.image_name === last.image_name) return;
    state.setRun(runFromLastRun(last));
  }, [last, finishedAt]);

  return { isGenerating: status?.state === 'generating', startedAt: status?.started_at ?? null };
}
