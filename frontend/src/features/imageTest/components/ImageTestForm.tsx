import { ImageIcon, Play, RotateCcw, ServerCog } from 'lucide-react';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { useImageTestStore } from '../../../stores/useImageTestStore';
import { useToastStore } from '../../../stores/useToastStore';
import { ImageBackend } from '../../../types/imageTest';
import { useImageTestDefaults } from '../hooks/useImageTestDefaults';
import { useImageTestRun } from '../hooks/useImageTestRun';
import {
  BACKEND_OPTIONS,
  seedFromDefaults,
  serverDefaultsPatch,
  urlError,
} from '../utils';
import { OrientationPicker } from './OrientationPicker';
import './ImageTest.css';

export function ImageTestForm() {
  const draft = useImageTestStore((state) => state.draft);
  const patch = useImageTestStore((state) => state.patch);
  const { data: defaults } = useImageTestDefaults();
  const { run, isRunning } = useImageTestRun();
  const info = useToastStore((state) => state.info);

  const [submitted, setSubmitted] = useState(false);
  const [urlTouched, setUrlTouched] = useState(false);
  const seeded = useRef(false);

  // The .env seed fills blanks only: a stored draft or a typed value always wins.
  // "Use server defaults" is the way out once the .env changed.
  useEffect(() => {
    if (!defaults || seeded.current) return;
    seeded.current = true;
    const state = useImageTestStore.getState();
    state.patch(seedFromDefaults(state.draft, defaults));
  }, [defaults]);

  const endpointError = urlError(draft.api_url);
  const promptError = draft.user_prompt.trim() ? null : 'Describe the image you want.';

  const submit = async () => {
    setSubmitted(true);
    if (endpointError || promptError) return;
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

  /** Discard the stored draft and load ROZ_IMAGE_TEST_* from the server. */
  const useServerDefaults = () => {
    if (!defaults) return;
    patch(serverDefaultsPatch(useImageTestStore.getState().draft, defaults));
    info('Form reloaded from the server configuration (ROZ_IMAGE_TEST_*).');
  };

  return (
    <aside className="it-form" onKeyDown={onKeyDown}>
      <header className="it-form-head">
        <div className="it-form-head-row">
          <h2 className="it-form-title">Image lab</h2>
          <Button
            variant="ghost"
            size="xs"
            leftIcon={<ServerCog size={12} />}
            onClick={useServerDefaults}
            disabled={!defaults}
            title="Discard the stored draft and load the endpoint, model, steps and master prompt set in the server's .env"
          >
            Use server defaults
          </Button>
        </div>
        <p className="it-form-sub">
          One image per run. Roz prepends the master prompt and appends the framing line.
        </p>
      </header>

      <div className="it-form-scroll">
        <section className="it-group">
          <h3 className="it-group-title">Endpoint</h3>
          <Input
            label="API URL"
            value={draft.api_url}
            onChange={(event) => patch({ api_url: event.target.value })}
            onBlur={() => setUrlTouched(true)}
            placeholder="http://127.0.0.1:8039"
            error={endpointError && (submitted || urlTouched) ? endpointError : undefined}
            spellCheck={false}
            autoComplete="off"
          />
          <Select
            label="Shape"
            options={BACKEND_OPTIONS}
            value={draft.backend}
            onChange={(event) =>
              patch({ backend: event.target.value as ImageBackend })
            }
          />
          <Input
            label="Model"
            value={draft.model}
            onChange={(event) => patch({ model: event.target.value })}
            placeholder="mlx-community/Qwen-Image-2512-6bit"
            hint="openai shape only"
            spellCheck={false}
            autoComplete="off"
          />
          <Input
            label="API key"
            type="password"
            value={draft.api_key}
            onChange={(event) => patch({ api_key: event.target.value })}
            placeholder={defaults?.has_key ? 'using ROZ_IMAGE_TEST_KEY' : 'none'}
            hint="empty = env"
            spellCheck={false}
            autoComplete="off"
          />
        </section>

        <section className="it-group">
          <h3 className="it-group-title">Sampling</h3>
          <div className="it-row">
            <Input
              label="Steps"
              type="number"
              min={1}
              max={100}
              value={draft.steps}
              onChange={(event) => patch({ steps: event.target.value })}
              hint="50 = model card"
            />
            <Input
              label="Guidance"
              type="number"
              min={0}
              max={20}
              step={0.5}
              value={draft.guidance}
              onChange={(event) => patch({ guidance: event.target.value })}
              hint="CFG · 4.0"
            />
          </div>
          <Input
            label="Seed"
            value={draft.seed}
            onChange={(event) => patch({ seed: event.target.value })}
            placeholder="random"
            hint="pin it to reproduce"
            spellCheck={false}
            autoComplete="off"
          />
          <p className="it-note">
            Diffusion has no temperature: the sampler's temperature analog is guidance (CFG).
          </p>
        </section>

        <OrientationPicker
          value={draft.orientation}
          onChange={(orientation) => patch({ orientation })}
        />

        <section className="it-group">
          <div className="it-group-head">
            <h3 className="it-group-title">Master prompt</h3>
            <div className="it-group-tools">
              <span className="it-count font-mono">
                {draft.master_prompt.length.toLocaleString()} chars
              </span>
              <Button
                variant="ghost"
                size="xs"
                leftIcon={<RotateCcw size={12} />}
                onClick={restorePrompt}
                disabled={!defaults}
                title="Restore the master prompt shipped with Roz"
              >
                Reset
              </Button>
            </div>
          </div>
          <Textarea
            mono
            rows={8}
            className="it-master"
            value={draft.master_prompt}
            onChange={(event) => patch({ master_prompt: event.target.value })}
            placeholder="Rendering instructions"
            spellCheck={false}
          />
          <p className="it-note">Sent first, then the subject, then the framing line.</p>
        </section>

        <section className="it-group">
          <h3 className="it-group-title">Prompt</h3>
          <Textarea
            rows={5}
            value={draft.user_prompt}
            onChange={(event) => patch({ user_prompt: event.target.value })}
            placeholder="Una moto scrambler aparcada frente a un bar de carretera al atardecer, luz cálida"
            error={submitted && promptError ? promptError : undefined}
          />
          <p className="it-note">
            The subject. Written in any language the model reads; the framing comes from the
            orientation above.
          </p>
        </section>

        <section className="it-group">
          <h3 className="it-group-title">Negative prompt</h3>
          <Textarea
            rows={2}
            value={draft.negative_prompt}
            onChange={(event) => patch({ negative_prompt: event.target.value })}
            placeholder="blurry, extra fingers, watermark"
          />
          <p className="it-note">
            <code>sdapi</code> only: the <code>/v1/images</code> shape has no negative field.
          </p>
        </section>
      </div>

      <footer className="it-form-foot">
        <Button
          variant="primary"
          size="md"
          leftIcon={isRunning ? <ImageIcon size={14} /> : <Play size={14} />}
          isLoading={isRunning}
          onClick={() => void submit()}
          className="it-run"
        >
          {isRunning ? 'Generating…' : 'Generate image'}
        </Button>
        <span className="it-kbd font-mono">⌘↵</span>
      </footer>
    </aside>
  );
}
