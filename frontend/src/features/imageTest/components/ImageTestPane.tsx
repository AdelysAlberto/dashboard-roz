import { ImageIcon, Play, RotateCcw } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { useImageTestStore } from '../../../stores/useImageTestStore';
import { ImageTestRun } from '../../../types/imageTest';
import { useElapsedSeconds } from '../../../hooks/useElapsedSeconds';
import { ImageMetrics } from './ImageMetrics';
import { ImageResultCard } from './ImageResultCard';
import { useImageTestRun } from '../hooks/useImageTestRun';
import { formatMs } from '../utils';
import './ImageTest.css';

function subtitleFor(run: ImageTestRun | null, error: string | null): string {
  if (error) return run ? `last run failed · ${formatMs(run.latency_ms)}` : 'last run failed';
  if (!run) return 'Nothing generated yet';
  const model = run.meta.model ?? run.meta.backend;
  return `${model} · ${run.image_name}`;
}

export function ImageTestPane() {
  const run = useImageTestStore((state) => state.run);
  const error = useImageTestStore((state) => state.error);
  const isRunning = useImageTestStore((state) => state.isRunning);
  const startedAt = useImageTestStore((state) => state.startedAt);
  const elapsed = useElapsedSeconds(startedAt, isRunning);
  const { run: generate } = useImageTestRun();

  return (
    <div className="it-pane">
      <header className="it-pane-head">
        <div className="it-pane-heading">
          <span className="it-pane-title">Image</span>
          <span className="it-pane-sub font-mono">
            {isRunning ? 'generating…' : subtitleFor(run, error)}
          </span>
        </div>
      </header>

      <div className="it-pane-scroll">
        {isRunning && (
          <section className="it-card it-running" aria-live="polite">
            <div className="it-running-line" />
            <div className="it-running-body">
              <span className="it-running-label">Diffusing</span>
              <span className="it-running-clock font-mono">{elapsed.toFixed(1)} s</span>
            </div>
            <p className="it-card-foot">
              A local sampler runs steps sequentially: the image arrives in one piece at the end.
            </p>
          </section>
        )}

        {!isRunning && error && (
          <Alert variant="error" title="The generation failed">
            <p className="it-error-msg font-mono">{error}</p>
            <Button
              variant="secondary"
              size="xs"
              leftIcon={<RotateCcw size={12} />}
              onClick={() => void generate()}
            >
              Retry
            </Button>
          </Alert>
        )}

        {!isRunning && !error && run && (
          <>
            <ImageResultCard run={run} />
            <ImageMetrics run={run} />
          </>
        )}

        {!isRunning && !error && !run && (
          <section className="it-card it-empty">
            <ImageIcon size={22} className="it-empty-icon" />
            <h3 className="it-empty-title">Generate one image</h3>
            <p className="it-empty-body">
              Fill the master prompt, the subject and the orientation on the right, then generate.
              Roz joins them into the single prompt a diffusion model expects and keeps the PNG on
              disk at full resolution.
            </p>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Play size={13} />}
              onClick={() => void generate()}
            >
              Generate image
            </Button>
          </section>
        )}
      </div>
    </div>
  );
}
