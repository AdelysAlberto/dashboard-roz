import { ImageIcon, Play, RotateCcw } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { useImageTestStore } from '../../../stores/useImageTestStore';
import { ImageTestRun } from '../../../types/imageTest';
import { useElapsedSeconds } from '../../../hooks/useElapsedSeconds';
import { ImageMetrics } from './ImageMetrics';
import { ImageResultCard } from './ImageResultCard';
import { useImageTestRun } from '../hooks/useImageTestRun';
import { useLocalRunSync } from '../hooks/useLocalRunSync';
import { useImageTestDefaults } from '../hooks/useImageTestDefaults';
import { formatMs, isLocalBackend } from '../utils';
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
  const storeStartedAt = useImageTestStore((state) => state.startedAt);
  const backend = useImageTestStore((state) => state.draft.backend);
  const { data: defaults } = useImageTestDefaults();
  // A reload keeps the local worker running: the clock has to come from the
  // server's start time, not from state that the reload erased.
  const { isGenerating, startedAt: localStartedAt } = useLocalRunSync();
  const local = isLocalBackend(backend);
  const working = isRunning || (local && isGenerating);
  const workStartedAt = isRunning
    ? storeStartedAt
    : localStartedAt
      ? Date.parse(localStartedAt)
      : null;
  const elapsed = useElapsedSeconds(workStartedAt, working);
  const { run: generate } = useImageTestRun();

  // The browser that started the run may be gone; the PNG still lands here.
  const outDir = defaults?.out_dir ?? '';

  return (
    <div className="it-pane">
      <header className="it-pane-head">
        <div className="it-pane-heading">
          <span className="it-pane-title">Image</span>
          <span className="it-pane-sub font-mono">
            {working ? 'generating…' : subtitleFor(run, error)}
          </span>
        </div>
      </header>

      <div className="it-pane-scroll">
        {working && (
          <section className="it-card it-running" aria-live="polite">
            <div className="it-running-line" />
            <div className="it-running-body">
              <span className="it-running-label">Diffusing</span>
              <span className="it-running-clock font-mono">{elapsed.toFixed(1)} s</span>
            </div>
            <p className="it-card-foot">
              A local sampler runs steps sequentially: the image arrives in one piece at the
              end{outDir ? ` and lands in ` : '.'}
              {outDir && <code className="it-path">{outDir}</code>}
            </p>
          </section>
        )}

        {!working && error && (
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

        {!working && !error && run && (
          <>
            <ImageResultCard run={run} />
            <ImageMetrics run={run} />
          </>
        )}

        {!working && !error && !run && (
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
