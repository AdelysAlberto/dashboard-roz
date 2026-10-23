import { Download, ExternalLink, Save } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { ImageTestRun } from '../../../types/imageTest';
import { baseName, dataUrl, fileUrl, formatBytes, formatMs } from '../utils';

interface Props {
  run: ImageTestRun;
}

/**
 * The image is the hero. Both buttons hand over the exact PNG the server wrote:
 * the download link is a plain anchor to that file, so the browser saves the
 * original bytes instead of re-encoding a canvas.
 */
export function ImageResultCard({ run }: Props) {
  const name = run.image_name || baseName(run.meta.saved_path);

  return (
    <section className="it-result">
      <div className="it-result-frame">
        <img
          className="it-result-img"
          src={dataUrl(run.image_b64)}
          alt="Generated image"
          decoding="async"
        />
      </div>

      <footer className="it-result-foot">
        <div className="it-result-facts font-mono">
          <span>{formatBytes(run.image_bytes)}</span>
          <span>PNG lossless</span>
          <span>{formatMs(run.latency_ms)}</span>
          <span>
            {run.meta.size[0] ?? '?'} × {run.meta.size[1] ?? '?'}
          </span>
        </div>
        <div className="it-result-actions">
          <a className="btn btn-secondary btn-sm" href={fileUrl(name)} download={name}>
            <span className="btn-icon-left">
              <Download size={13} />
            </span>
            <span className="btn-label">Download PNG</span>
          </a>
          <a className="btn btn-ghost btn-sm" href={fileUrl(name)} target="_blank" rel="noreferrer">
            <span className="btn-icon-left">
              <ExternalLink size={13} />
            </span>
            <span className="btn-label">Open</span>
          </a>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Save size={13} />}
            onClick={() => {
              void navigator.clipboard?.writeText(run.meta.saved_path);
            }}
            title={run.meta.saved_path}
          >
            Copy path
          </Button>
        </div>
      </footer>
    </section>
  );
}
