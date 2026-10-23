import { Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { useToastStore } from '../../../stores/useToastStore';
import { LlmTestRun } from '../../../types/llmTest';
import { copyText } from '../../../utils/clipboard';
import { isJsonParsed, renderContent } from '../utils';

interface Props {
  run: LlmTestRun;
}

/** The payload the operator came here to read: the assistant's content, nothing else. */
export function LlmContentCard({ run }: Props) {
  const [pretty, setPretty] = useState(true);
  const notifySuccess = useToastStore((state) => state.success);
  const notifyError = useToastStore((state) => state.error);
  const parsed = isJsonParsed(run);
  const shown = renderContent(run, pretty);

  const copy = async () => {
    const ok = await copyText(shown);
    if (ok) notifySuccess('Content copied to the clipboard.');
    else notifyError('The browser blocked the clipboard write.');
  };

  return (
    <section className="llmt-card llmt-content-card">
      <header className="llmt-card-head">
        <span className="llmt-card-label">content</span>
        <div className="llmt-card-tools">
          {parsed && (
            <div className="llmt-segmented" role="group" aria-label="Content format">
              <button
                type="button"
                className={pretty ? 'is-on' : ''}
                aria-pressed={pretty}
                onClick={() => setPretty(true)}
              >
                Formatted
              </button>
              <button
                type="button"
                className={!pretty ? 'is-on' : ''}
                aria-pressed={!pretty}
                onClick={() => setPretty(false)}
              >
                Raw
              </button>
            </div>
          )}
          <Button
            variant="ghost"
            size="xs"
            leftIcon={<Copy size={12} />}
            onClick={() => void copy()}
          >
            Copy
          </Button>
        </div>
      </header>

      {run.reasoning && (
        <details className="llmt-reasoning">
          <summary className="llmt-reasoning-summary">
            thinking · {run.reasoning.length.toLocaleString()} chars
          </summary>
          <pre className="llmt-code llmt-code-sm">{run.reasoning}</pre>
        </details>
      )}

      {shown ? (
        <pre className="llmt-code">{shown}</pre>
      ) : (
        <p className="llmt-card-empty">The model returned an empty content string.</p>
      )}

      {!parsed && run.parse_error && (
        <p className="llmt-card-foot">Not JSON · {run.parse_error}</p>
      )}
    </section>
  );
}
