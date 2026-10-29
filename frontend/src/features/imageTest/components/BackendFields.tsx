import { useState } from 'react';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { useImageTestStore } from '../../../stores/useImageTestStore';
import { ImageBackend } from '../../../types/imageTest';
import { BACKEND_OPTIONS, isLocalBackend, urlError } from '../utils';
import { LocalModelCard } from './LocalModelCard';

export interface BackendFieldsProps {
  /** Blocks the submit when it has a value; the local backend has no endpoint. */
  submitted: boolean;
  hasKey: boolean;
}

/**
 * Everything that identifies the generator: the shape selector plus, except for
 * the local backend, the endpoint it talks to. Split from the form so the rail
 * stays readable and each group owns its own validation touch state.
 */
export function BackendFields({ submitted, hasKey }: BackendFieldsProps) {
  const draft = useImageTestStore((state) => state.draft);
  const patch = useImageTestStore((state) => state.patch);
  const [urlTouched, setUrlTouched] = useState(false);

  const local = isLocalBackend(draft.backend);
  const endpointError = local ? null : urlError(draft.api_url);
  const showError = Boolean(endpointError) && (submitted || urlTouched);

  return (
    <>
      <section className="it-group">
        <h3 className="it-group-title">Backend</h3>
        <Select
          label="Shape"
          options={BACKEND_OPTIONS}
          value={draft.backend}
          onChange={(event) => patch({ backend: event.target.value as ImageBackend })}
        />
        {local ? (
          <p className="it-note">
            Roz loads the weights itself through mflux: no endpoint, no key, no HTTP hop.
          </p>
        ) : (
          <>
            <Input
              label="API URL"
              value={draft.api_url}
              onChange={(event) => patch({ api_url: event.target.value })}
              onBlur={() => setUrlTouched(true)}
              placeholder="http://127.0.0.1:8039"
              error={showError ? endpointError ?? undefined : undefined}
              spellCheck={false}
              autoComplete="off"
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
              placeholder={hasKey ? 'using ROZ_IMAGE_TEST_KEY' : 'none'}
              hint="empty = env"
              spellCheck={false}
              autoComplete="off"
            />
          </>
        )}
      </section>

      {local && <LocalModelCard />}
    </>
  );
}
