import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { useLlmTestStore } from '../../../stores/useLlmTestStore';
import { LlmThinkingMode } from '../../../types/llmTest';

const MODES = [
  { value: 'default', label: 'Model default' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

/**
 * oMLX accepts `enable_thinking` per request and forwards `reasoning_effort` /
 * `thinking_budget` to the chat template. Whether anything happens is the
 * model's call: the Qwen3-*-Instruct-2507 templates have no thinking branch.
 */
export function LlmThinkingFields() {
  const draft = useLlmTestStore((state) => state.draft);
  const patch = useLlmTestStore((state) => state.patch);

  return (
    <>
      <Select
        aria-label="Thinking"
        options={MODES}
        value={draft.thinking}
        onChange={(event) => patch({ thinking: event.target.value as LlmThinkingMode })}
      />
      {draft.thinking !== 'off' && (
        <div className="llmt-row">
          <Input
            label="Effort"
            value={draft.reasoning_effort}
            onChange={(event) => patch({ reasoning_effort: event.target.value })}
            placeholder="low | medium | xhigh"
            spellCheck={false}
          />
          <Input
            label="Think budget"
            type="number"
            min={0}
            value={draft.thinking_budget}
            onChange={(event) => patch({ thinking_budget: event.target.value })}
            placeholder="unlimited"
          />
        </div>
      )}
      <p className="llmt-note">
        The chat template decides: <code>Qwen3-*-Instruct-2507</code> has no thinking branch and
        ignores the flag.
      </p>
    </>
  );
}
