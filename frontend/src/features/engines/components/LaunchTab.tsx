import { Play, Square } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ServiceInfo } from '../../../types/service';
import { EngineAction } from '../hooks/useEngine';

interface LaunchTabProps {
  service: ServiceInfo;
  pending: boolean;
  onAction: (action: EngineAction, label: string) => Promise<void>;
}

export function LaunchTab({ service, pending, onAction }: LaunchTabProps) {
  const [model, setModel] = useState('');
  const [flags, setFlags] = useState('');
  const port = service.units[0]?.port ?? 8038;

  const launch = () => {
    const args = flags
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    return onAction({ kind: 'launch', model: model.trim(), args }, `Lanzar ${model.trim()}`);
  };

  return (
    <div className="engine-tab-body">
      <div className="engine-section">
        <h5>Lanzar Splash (un modelo por proceso)</h5>
        <p className="engine-muted">
          Splash sirve un único modelo por proceso, en el puerto {port}. Elegí el modelo y, si
          querés, flags extra (solo se aceptan los de su CLI: <code>--max-context</code>,{' '}
          <code>--kv-format</code>, <code>--idle-release</code>, <code>--queue-size</code>…).
        </p>
        <div className="engine-form engine-form-wide">
          <label className="engine-field">
            <span>Modelo</span>
            <Input
              placeholder="owner/repo[:variante]  (ej. unsloth/Qwen3.8-27B-GGUF:UD-Q4_K_M)"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="font-mono"
            />
          </label>
          <label className="engine-field">
            <span>Flags (opcional)</span>
            <Input
              placeholder="--max-context 32768 --kv-format int8"
              value={flags}
              onChange={(e) => setFlags(e.target.value)}
              className="font-mono"
            />
          </label>
        </div>
        <div className="engine-actions-row">
          <Button
            variant="secondary"
            size="sm"
            disabled={pending || model.trim().length < 3}
            isLoading={pending}
            leftIcon={<Play size={12} />}
            onClick={launch}
          >
            Lanzar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            leftIcon={<Square size={12} />}
            onClick={() => onAction({ kind: 'server', op: 'stop' }, 'Parar Splash')}
          >
            Parar
          </Button>
        </div>
      </div>
    </div>
  );
}
