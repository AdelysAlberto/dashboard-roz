import { useEffect, useState } from 'react';

/**
 * Seconds elapsed since `startedAt`, ticking while `active`. A spinner without
 * a number hides whether the model is thinking or the endpoint is dead.
 */
export function useElapsedSeconds(startedAt: number | null, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || startedAt === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [active, startedAt]);

  if (startedAt === null || !active) return 0;
  return Math.max(0, (now - startedAt) / 1000);
}
