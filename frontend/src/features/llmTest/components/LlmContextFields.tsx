import { Input } from '../../../components/ui/Input';
import { useLlmTestStore } from '../../../stores/useLlmTestStore';

/** The device block the app appends to the user turn: GPS, vehicle, preferences. */
export function LlmContextFields() {
  const context = useLlmTestStore((state) => state.draft.context);
  const patchContext = useLlmTestStore((state) => state.patchContext);

  return (
    <div className="llmt-context">
      <div className="llmt-row">
        <Input
          label="Latitude"
          value={context.latitude}
          onChange={(event) => patchContext({ latitude: event.target.value })}
          spellCheck={false}
        />
        <Input
          label="Longitude"
          value={context.longitude}
          onChange={(event) => patchContext({ longitude: event.target.value })}
          spellCheck={false}
        />
      </div>
      <Input
        label="Vehicle"
        value={context.vehicle}
        onChange={(event) => patchContext({ vehicle: event.target.value })}
        placeholder="moto"
        spellCheck={false}
      />
      <div className="llmt-checks">
        <label className="llmt-check">
          <input
            type="checkbox"
            checked={context.avoid_highways}
            onChange={(event) => patchContext({ avoid_highways: event.target.checked })}
          />
          Avoid highways
        </label>
        <label className="llmt-check">
          <input
            type="checkbox"
            checked={context.avoid_tolls}
            onChange={(event) => patchContext({ avoid_tolls: event.target.checked })}
          />
          Avoid tolls
        </label>
        <label className="llmt-check">
          <input
            type="checkbox"
            checked={context.prefer_curves}
            onChange={(event) => patchContext({ prefer_curves: event.target.checked })}
          />
          Prefer curves
        </label>
      </div>
    </div>
  );
}
