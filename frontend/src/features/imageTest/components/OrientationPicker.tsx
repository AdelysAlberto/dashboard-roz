import { ImageOrientation } from '../../../types/imageTest';

interface Choice {
  id: ImageOrientation;
  label: string;
  /** The Qwen-Image bucket each ratio maps to, so the picker is not abstract. */
  pixels: string;
  /** Width/height ratio of the glyph. */
  glyph: { w: number; h: number };
}

const CHOICES: Choice[] = [
  { id: '1:1', label: '1:1', pixels: '1328 × 1328', glyph: { w: 16, h: 16 } },
  { id: '16:9', label: '16:9', pixels: '1664 × 928', glyph: { w: 20, h: 11 } },
  { id: '9:16', label: '9:16', pixels: '928 × 1664', glyph: { w: 11, h: 20 } },
];

interface Props {
  value: ImageOrientation;
  onChange: (value: ImageOrientation) => void;
}

/**
 * Radios, not a select: the three framings are the whole decision and the glyph
 * carries it faster than the label does.
 */
export function OrientationPicker({ value, onChange }: Props) {
  return (
    <fieldset className="it-orient">
      <legend className="it-group-title">Orientation</legend>
      <div className="it-orient-row">
        {CHOICES.map((choice) => {
          const active = choice.id === value;
          return (
            <label key={choice.id} className={`it-orient-option ${active ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="image-orientation"
                value={choice.id}
                checked={active}
                onChange={() => onChange(choice.id)}
              />
              <span
                className="it-orient-glyph"
                style={{ aspectRatio: `${choice.glyph.w} / ${choice.glyph.h}` }}
                aria-hidden="true"
              />
              <span className="it-orient-label">{choice.label}</span>
              <span className="it-orient-pixels font-mono">{choice.pixels}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
