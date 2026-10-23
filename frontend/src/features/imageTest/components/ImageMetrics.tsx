import { ImageTestRun } from '../../../types/imageTest';
import { formatMs } from '../utils';

interface Props {
  run: ImageTestRun;
}

interface Row {
  label: string;
  value: string;
  wide?: boolean;
}

function group(title: string, rows: Row[]) {
  return (
    <div className="it-metric-group" key={title}>
      <h4 className="it-metric-title">{title}</h4>
      <dl className="it-metrics">
        {rows.map((row) => (
          <div className={`it-metric ${row.wide ? 'is-wide' : ''}`} key={row.label}>
            <dt>{row.label}</dt>
            <dd className="font-mono" title={row.value}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** What produced the image, read back from the payload Roz actually sent plus
 * whatever the generator echoed. Diffusion replies omit the sampler settings. */
export function ImageMetrics({ run }: Props) {
  const sent = run.request.payload;
  const prompt = typeof sent.prompt === 'string' ? sent.prompt : '';
  const width = sent.width ?? run.meta.size[0];
  const height = sent.height ?? run.meta.size[1];

  return (
    <section className="it-card">
      <header className="it-card-head">
        <span className="it-card-label">envelope</span>
        <span className="it-card-meta font-mono">{formatMs(run.latency_ms)} round trip</span>
      </header>

      <div className="it-metric-groups">
        {group('Image', [
          { label: 'generator', value: run.meta.backend },
          { label: 'model', value: run.meta.model ?? '—', wide: true },
          { label: 'size', value: `${width ?? '?'} × ${height ?? '?'}` },
          { label: 'seed', value: run.meta.seed === null ? '—' : String(run.meta.seed) },
          { label: 'steps', value: run.meta.steps === null ? '—' : String(run.meta.steps) },
          {
            label: 'guidance',
            value: run.meta.guidance === null ? '—' : String(run.meta.guidance),
          },
          { label: 'file', value: run.image_name },
        ])}

        {group('Prompt sent', [
          { label: 'chars', value: String(prompt.length) },
          { label: 'lines', value: String(prompt.split('\n').length) },
        ])}
      </div>

      <details className="it-prompt-details">
        <summary>Exact prompt</summary>
        <pre className="it-code">{prompt}</pre>
      </details>

      <p className="it-card-foot font-mono" title={run.request.url}>
        POST {run.request.url}
      </p>
    </section>
  );
}
