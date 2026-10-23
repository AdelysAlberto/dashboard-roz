import { LlmTestRun } from '../../../types/llmTest';
import { formatCreated, formatMs, formatNumber, formatSeconds } from '../utils';

interface Props {
  run: LlmTestRun;
}

interface Row {
  label: string;
  value: string;
  wide?: boolean;
}

function group(title: string, rows: Row[]) {
  return (
    <div className="llmt-metric-group" key={title}>
      <h4 className="llmt-metric-title">{title}</h4>
      <dl className="llmt-metrics">
        {rows.map((row) => (
          <div className={`llmt-metric ${row.wide ? 'is-wide' : ''}`} key={row.label}>
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

/** Everything the response says besides `content`: the envelope, the bill, the clock.
 * The reply never repeats the sampling parameters, so the ones that produced it are
 * read back from the payload Roz sent. */
export function LlmMetrics({ run }: Props) {
  const { meta } = run;
  const sent = run.request.payload;
  const sentTemperature =
    typeof sent.temperature === 'number' ? sent.temperature.toFixed(2) : '—';
  const sentModel = typeof sent.model === 'string' ? sent.model : '—';
  const sentMaxTokens =
    typeof sent.max_tokens === 'number' ? String(sent.max_tokens) : 'unset';
  const sentThinking =
    sent.enable_thinking === true ? 'on' : sent.enable_thinking === false ? 'off' : 'model default';
  const sentEffort =
    typeof sent.reasoning_effort === 'string' || typeof sent.reasoning_effort === 'number'
      ? String(sent.reasoning_effort)
      : 'default';
  const sentBudget =
    typeof sent.thinking_budget === 'number' ? String(sent.thinking_budget) : 'unset';
  const prompt = meta.usage.prompt_tokens ?? 0;
  const completion = meta.usage.completion_tokens ?? 0;
  const total = prompt + completion;
  const cached = meta.usage.cached_tokens ?? 0;
  const cachedShare = prompt > 0 && cached > 0 ? Math.min(100, (cached / prompt) * 100) : 0;
  const completionShare = total > 0 ? (completion / total) * 100 : 0;

  return (
    <section className="llmt-card llmt-metrics-card">
      <header className="llmt-card-head">
        <span className="llmt-card-label">envelope</span>
        <span className="llmt-card-meta font-mono">{formatMs(run.latency_ms)} round trip</span>
      </header>

      <div className="llmt-metric-groups">
        {group('Response', [
          { label: 'model', value: meta.model ?? '—', wide: true },
          { label: 'finish', value: meta.finish_reason ?? '—' },
          { label: 'role', value: meta.role ?? '—' },
          { label: 'id', value: meta.id ?? '—', wide: true },
          { label: 'created', value: formatCreated(meta.created), wide: true },
        ])}

        {group('Sent', [
          { label: 'temperature', value: sentTemperature },
          { label: 'max tokens', value: sentMaxTokens },
          { label: 'thinking', value: sentThinking },
          { label: 'effort', value: sentEffort },
          { label: 'think budget', value: sentBudget },
          { label: 'model', value: sentModel, wide: true },
        ])}

        {group('Tokens', [
          { label: 'prompt', value: formatNumber(meta.usage.prompt_tokens) },
          { label: 'cached', value: formatNumber(cached > 0 ? cached : null) },
          { label: 'completion', value: formatNumber(meta.usage.completion_tokens) },
          { label: 'total', value: formatNumber(meta.usage.total_tokens) },
        ])}

        {group('Timings', [
          { label: 'ttft', value: formatSeconds(meta.timings.time_to_first_token) },
          { label: 'total', value: formatSeconds(meta.timings.total_time) },
          { label: 'prompt eval', value: formatSeconds(meta.timings.prompt_eval_duration) },
          { label: 'generation', value: formatSeconds(meta.timings.generation_duration) },
          {
            label: 'prompt tok/s',
            value: formatNumber(meta.timings.prompt_tokens_per_second, 1),
          },
          {
            label: 'gen tok/s',
            value: formatNumber(meta.timings.generation_tokens_per_second, 1),
          },
        ])}
      </div>

      {total > 0 && (
        <div className="llmt-split">
          <div className="llmt-split-bar" aria-hidden="true">
            <span className="llmt-split-prompt" style={{ width: `${100 - completionShare}%` }} />
            <span className="llmt-split-completion" style={{ width: `${completionShare}%` }} />
          </div>
          <p className="llmt-split-legend">
            <span>{formatNumber(prompt)} prompt</span>
            <span>{formatNumber(completion)} completion</span>
            {cachedShare > 0 && <span>{Math.round(cachedShare)}% of prompt cached</span>}
          </p>
        </div>
      )}

      <p className="llmt-card-foot font-mono" title={run.request.url}>
        POST {run.request.url}
      </p>
    </section>
  );
}
