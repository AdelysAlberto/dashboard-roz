import './Switch.css';

export interface SwitchProps {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  busy?: boolean;
  size?: 'sm' | 'md';
}

export function Switch({
  checked,
  label,
  onChange,
  disabled = false,
  busy = false,
  size = 'sm',
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy}
      disabled={disabled || busy}
      className={`switch switch-${size} ${checked ? 'switch-on' : 'switch-off'} ${
        busy ? 'switch-busy' : ''
      }`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
    </button>
  );
}
