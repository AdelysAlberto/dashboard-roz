import { Input } from '../../../components/ui/Input';
import { useLlmTestStore } from '../../../stores/useLlmTestStore';

interface Props {
  /** URL format error, shown only after a blur or a submit attempt. */
  endpointError?: string;
  /** Required-field error, shown only after a submit attempt. */
  modelError?: string;
  /** Placeholder for the key field: the server reports whether .env has one. */
  keyHint: string;
  onUrlBlur: () => void;
}

export function LlmEndpointFields({ endpointError, modelError, keyHint, onUrlBlur }: Props) {
  const draft = useLlmTestStore((state) => state.draft);
  const patch = useLlmTestStore((state) => state.patch);

  return (
    <>
      <Input
        label="API URL"
        value={draft.api_url}
        onChange={(event) => patch({ api_url: event.target.value })}
        onBlur={onUrlBlur}
        placeholder="http://host:8030/v1"
        error={endpointError}
        spellCheck={false}
        autoComplete="off"
      />
      <Input
        label="Model"
        value={draft.model}
        onChange={(event) => patch({ model: event.target.value })}
        placeholder="Qwen3-4B-Instruct-2507-4bit"
        error={modelError}
        spellCheck={false}
        autoComplete="off"
      />
      <Input
        label="API key"
        type="password"
        value={draft.api_key}
        onChange={(event) => patch({ api_key: event.target.value })}
        placeholder={keyHint}
        hint="empty = env"
        spellCheck={false}
        autoComplete="off"
      />
      <div className="llmt-row">
        <div className="llmt-temp">
          <div className="llmt-temp-head">
            <span className="llmt-temp-label">Temperature</span>
            <span className="llmt-temp-value font-mono">{draft.temperature.toFixed(2)}</span>
          </div>
          <input
            className="llmt-range"
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={draft.temperature}
            aria-label="Temperature"
            onChange={(event) => patch({ temperature: Number(event.target.value) })}
          />
        </div>
        <Input
          label="Max tokens"
          type="number"
          min={1}
          value={draft.max_tokens}
          onChange={(event) => patch({ max_tokens: event.target.value })}
          placeholder="unset"
          className="llmt-max-tokens"
        />
      </div>
    </>
  );
}
