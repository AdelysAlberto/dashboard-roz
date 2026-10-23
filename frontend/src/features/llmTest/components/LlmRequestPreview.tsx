import { ChevronDown, Copy } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { useToastStore } from '../../../stores/useToastStore';
import { copyText } from '../../../utils/clipboard';
import { useLlmTestPreview } from '../hooks/useLlmTestPreview';

/**
 * Audit view: the exact body Roz builds from plain-text inputs, including the
 * tags. Collapsed by default — it costs a request and it is not the answer.
 */
export function LlmRequestPreview() {
  const [open, setOpen] = useState(false);
  const query = useLlmTestPreview(open);
  const notifySuccess = useToastStore((state) => state.success);
  const notifyError = useToastStore((state) => state.error);

  const body = query.data ? JSON.stringify(query.data.payload, null, 2) : '';

  const copy = async () => {
    const ok = await copyText(body);
    if (ok) notifySuccess('Request body copied to the clipboard.');
    else notifyError('The browser blocked the clipboard write.');
  };

  return (
    <section className="llmt-card llmt-preview">
      <button
        type="button"
        className={`llmt-disclosure ${open ? 'is-open' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown size={13} className="llmt-disclosure-icon" />
        <span>Request preview</span>
        <span className="llmt-disclosure-summary">what Roz sends</span>
      </button>

      {open && (
        <div className="llmt-preview-body">
          {query.isError && <Alert variant="error" title="Preview failed">{query.error.message}</Alert>}
          {!query.isError && !query.data && (
            <p className="llmt-card-empty">Building the request…</p>
          )}
          {query.data && (
            <>
              <div className="llmt-preview-bar">
                <span className="llmt-preview-url font-mono" title={query.data.url}>
                  {query.data.url}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  leftIcon={<Copy size={12} />}
                  onClick={() => void copy()}
                >
                  Copy
                </Button>
              </div>
              <pre className="llmt-code llmt-code-sm">{body}</pre>
            </>
          )}
        </div>
      )}
    </section>
  );
}
