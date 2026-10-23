import { ChevronDown, Play, RotateCcw, ServerCog } from 'lucide-react';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Textarea } from '../../../components/ui/Textarea';
import { useLlmTestStore } from '../../../stores/useLlmTestStore';
import { useToastStore } from '../../../stores/useToastStore';
import { useLlmTestDefaults } from '../hooks/useLlmTestDefaults';
import { useLlmTestRun } from '../hooks/useLlmTestRun';
import { contextSummary, seedFromDefaults, serverDefaultsPatch, urlError } from '../utils';
import { LlmContextFields } from './LlmContextFields';
import { LlmEndpointFields } from './LlmEndpointFields';
import { LlmThinkingFields } from './LlmThinkingFields';
import './LlmTestForm.css';
import './LlmTest.css';

export function LlmTestForm() {
  const draft = useLlmTestStore((state) => state.draft);
  const patch = useLlmTestStore((state) => state.patch);
  const patchContext = useLlmTestStore((state) => state.patchContext);
  const { data: defaults } = useLlmTestDefaults();
  const { run, isRunning } = useLlmTestRun();
  const info = useToastStore((state) => state.info);

  const [submitted, setSubmitted] = useState(false);
  const [urlTouched, setUrlTouched] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const seeded = useRef(false);

  // The .env seed fills blanks only: a stored draft or a typed value always wins.
  // "Use server defaults" below is the way out once the .env changed and the
  // stored draft is the thing you no longer want.
  useEffect(() => {
    if (!defaults || seeded.current) return;
    seeded.current = true;
    const state = useLlmTestStore.getState();
    const { draft: current } = state;
    state.patch(seedFromDefaults(current, defaults));
    state.patchContext({
      latitude: current.context.latitude || defaults.context.latitude,
      longitude: current.context.longitude || defaults.context.longitude,
      vehicle: current.context.vehicle || defaults.context.vehicle,
    });
  }, [defaults]);

  const endpointError = urlError(draft.api_url);
  const modelError = draft.model.trim() ? null : 'The model name is required.';

  const submit = async () => {
    setSubmitted(true);
    if (endpointError || modelError) return;
    await run();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

  const restorePrompt = () => {
    if (!defaults) return;
    patch({ master_prompt: defaults.master_prompt });
    info('Master prompt restored to the server default.');
  };

  /** Discard the stored draft and load ROZ_LLM_TEST_* from the server. */
  const useServerDefaults = () => {
    if (!defaults) return;
    const { fields, context } = serverDefaultsPatch(useLlmTestStore.getState().draft, defaults);
    patch(fields);
    patchContext(context);
    info('Form reloaded from the server configuration (ROZ_LLM_TEST_*).');
  };

  return (
    <aside className="llmt-form" onKeyDown={onKeyDown}>
      <header className="llmt-form-head">
        <div className="llmt-form-head-row">
          <h2 className="llmt-form-title">Prompt lab</h2>
          <Button
            variant="ghost"
            size="xs"
            leftIcon={<ServerCog size={12} />}
            onClick={useServerDefaults}
            disabled={!defaults}
            title="Discard the stored draft and load the endpoint, model, temperature and master prompt set in the server's .env"
          >
            Use server defaults
          </Button>
        </div>
        <p className="llmt-form-sub">
          One probe per run. You type plain text; Roz builds the envelope.
        </p>
      </header>

      <div className="llmt-form-scroll">
        <section className="llmt-group">
          <h3 className="llmt-group-title">Endpoint</h3>
          <LlmEndpointFields
            endpointError={
              endpointError && (submitted || urlTouched) ? endpointError : undefined
            }
            modelError={submitted && modelError ? modelError : undefined}
            keyHint={defaults?.has_key ? 'using ROZ_LLM_TEST_KEY' : 'sk-…'}
            onUrlBlur={() => setUrlTouched(true)}
          />
        </section>

        <section className="llmt-group">
          <h3 className="llmt-group-title">Thinking</h3>
          <LlmThinkingFields />
        </section>

        <section className="llmt-group">
          <div className="llmt-group-head">
            <h3 className="llmt-group-title">Master prompt</h3>
            <div className="llmt-group-tools">
              <span className="llmt-count font-mono">
                {draft.master_prompt.length.toLocaleString()} chars
              </span>
              <Button
                variant="ghost"
                size="xs"
                leftIcon={<RotateCcw size={12} />}
                onClick={restorePrompt}
                disabled={!defaults}
                title="Restore the Viara master prompt shipped with Roz"
              >
                Reset
              </Button>
            </div>
          </div>
          <Textarea
            mono
            rows={10}
            className="llmt-master"
            value={draft.master_prompt}
            onChange={(event) => patch({ master_prompt: event.target.value })}
            placeholder="System prompt"
            spellCheck={false}
          />
          <p className="llmt-note">
            Sent as <code>&lt;system_instructions&gt;…&lt;/system_instructions&gt;</code>
          </p>
        </section>

        <section className="llmt-group">
          <h3 className="llmt-group-title">User prompt</h3>
          <Textarea
            rows={4}
            value={draft.user_prompt}
            onChange={(event) => patch({ user_prompt: event.target.value })}
            placeholder="Llevame a Herrera Oria 248 pero antes paso por la Vaguada"
          />
          <p className="llmt-note">
            Plain text. Roz wraps it in <code>&lt;user_input&gt;</code> and appends the device
            context.
          </p>
        </section>

        <section className="llmt-group">
          <button
            type="button"
            className={`llmt-disclosure ${contextOpen ? 'is-open' : ''}`}
            onClick={() => setContextOpen((open) => !open)}
            aria-expanded={contextOpen}
          >
            <ChevronDown size={13} className="llmt-disclosure-icon" />
            <span>Device context</span>
            {!contextOpen && (
              <span className="llmt-disclosure-summary">{contextSummary(draft.context)}</span>
            )}
          </button>
          {contextOpen && <LlmContextFields />}
        </section>
      </div>

      <footer className="llmt-form-foot">
        <Button
          variant="primary"
          size="md"
          leftIcon={<Play size={14} />}
          isLoading={isRunning}
          onClick={() => void submit()}
          className="llmt-run"
        >
          {isRunning ? 'Running…' : 'Run test'}
        </Button>
        <span className="llmt-kbd font-mono">⌘↵</span>
      </footer>
    </aside>
  );
}
