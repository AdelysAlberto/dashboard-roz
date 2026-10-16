/** Pure formatting helpers for the services board. */

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

export function formatUptime(seconds: number | null): string | null {
  if (seconds === null || seconds < 0) return null;
  if (seconds < MINUTE) return `${Math.round(seconds)}s`;
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m`;
  if (seconds < DAY) {
    const h = Math.floor(seconds / HOUR);
    const m = Math.floor((seconds % HOUR) / MINUTE);
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  return `${Math.floor(seconds / DAY)}d`;
}

/** Last meaningful line of command output, truncated for a toast. */
export function lastLine(text: string, max = 180): string {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const line = lines[lines.length - 1] ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
