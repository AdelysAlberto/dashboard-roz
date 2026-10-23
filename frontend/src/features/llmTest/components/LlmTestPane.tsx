import { FlaskConical, Play, RotateCcw } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { useLlmTestStore } from '../../../stores/useLlmTestStore';
import { LlmTestRun } from '../../../types/llmTest';
import { useElapsedSeconds } from '../../../hooks/useElapsedSeconds';
import { useLlmTestRun } from '../hooks/useLlmTestRun';
import { formatMs } from '../utils';
import { LlmContentCard } from './LlmContentCard';
import { LlmMetrics } from './LlmMetrics';
import { LlmRequestPreview } from './LlmRequestPreview';
import './LlmTestPane.css';
import './LlmTest.css';

function subtitleFor(run: LlmTestRun | null, error: string | null): string {
  if (error) return run ? `last probe failed · ${formatMs(run.latency_ms)}` : 'last probe failed';
  if (!run) return 'Nothing sent yet';
  const model = run.meta.model ?? 'unknown model';
  const finish = run.meta.finish_reason ?? 'no finish reason';
  return `${model} · ${finish} · ${formatMs(run.latency_ms)}`;
}

export function LlmTestPane() {
  const run = useLlmTestStore((state) => state.run);
  const error = useLlmTestStore((state) => state.error);
  const isRunning = useLlmTestStore((state) => state.isRunning);
  const startedAt = useLlmTestStore((state) => state.startedAt);
  const elapsed = useElapsedSeconds(startedAt, isRunning);
  const { run: runProbe } = useLlmTestRun();

  return (
    <div className="llmt-pane">
      <header className="llmt-pane-head">
        <div className="llmt-pane-heading">
          <span className="llmt-pane-title">Response</span>
          <span className="llmt-pane-sub font-mono">
            {isRunning ? 'calling…' : subtitleFor(run, error)}
          </span>
        </div>
      </header>

      <div className="llmt-pane-scroll">
        {isRunning && (
          <section className="llmt-card llmt-running" aria-live="polite">
            <div className="llmt-running-line" />
            <div className="llmt-running-body">
              <span className="llmt-running-label">Calling the model</span>
              <span className="llmt-running-clock font-mono">{elapsed.toFixed(1)} s</span>
            </div>
            <p className="llmt-card-foot">
              Non-streaming call: the whole answer arrives at once.
            </p>
          </section>
        )}

        {!isRunning && error && (
          <Alert variant="error" title="The probe failed">
            <p className="llmt-error-msg font-mono">{error}</p>
            <Button
              variant="secondary"
              size="xs"
              leftIcon={<RotateCcw size={12} />}
              onClick={() => void runProbe()}
            >
              Retry
            </Button>
          </Alert>
        )}

        {!isRunning && !error && run && (
          <>
            <LlmContentCard run={run} />
            <LlmMetrics run={run} />
          </>
        )}

        {!isRunning && !error && !run && (
          <section className="llmt-card llmt-empty">
            <FlaskConical size={22} className="llmt-empty-icon" />
            <h3 className="llmt-empty-title">Send one probe</h3>
            <p className="llmt-empty-body">
              Fill the master prompt and the user request on the right, then run it. Roz wraps both
              in the tags the app expects and shows the raw content plus the envelope numbers.
            </p>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Play size={13} />}
              onClick={() => void runProbe()}
            >
              Run test
            </Button>
          </section>
        )}

        {!isRunning && <LlmRequestPreview />}
      </div>
    </div>
  );
}
