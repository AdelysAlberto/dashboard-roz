import { Download, RefreshCw, Upload } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { EngineMetrics, WhisperMetrics } from '../../../types/engine';
import { ServiceInfo } from '../../../types/service';
import { formatUptime } from '../../../utils/format';
import { EngineAction, useEngineMetrics } from '../hooks/useEngine';

interface SttTabProps {
  service: ServiceInfo;
  pending: boolean;
  onAction: (action: EngineAction, label: string) => Promise<void>;
}

const mb = (value: number | null): string => (value === null ? '—' : `${value.toFixed(1)} MB`);

const loadedFor = (health: WhisperMetrics['health']): string | null => {
  if (!health.model_loaded || health.model_loaded_at === null) return null;
  const seconds = Math.max(0, Date.now() / 1000 - health.model_loaded_at);
  return formatUptime(seconds);
};

export function SttTab({ service, pending, onAction }: SttTabProps) {
  const metrics = useEngineMetrics(service.id);
  const health = (metrics.data as EngineMetrics | undefined)?.health as
    | WhisperMetrics['health']
    | undefined;

  if (metrics.isLoading) return <p className="engine-muted">Leyendo estado del modelo…</p>;
  if (metrics.isError || !health)
    return <p className="engine-error">Whisper STT no responde. Arrancá el servicio y reintentá.</p>;

  const toggle = () =>
    void onAction(
      { kind: 'model', model_id: health.model, op: health.model_loaded ? 'unload' : 'load' },
      health.model_loaded ? 'Descargar modelo' : 'Cargar modelo',
    );

  return (
    <div className="engine-tab-body">
      <div className="engine-section">
        <div className="engine-section-head">
          <h5>Modelo</h5>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void metrics.refetch()}
            isLoading={metrics.isFetching}
            leftIcon={<RefreshCw size={11} />}
          >
            Refrescar
          </Button>
        </div>
        <ul className="engine-kv font-mono">
          <li>
            <span>modelo</span>
            <span className="engine-kv-value">{health.model}</span>
          </li>
          <li>
            <span>estado</span>
            <span className={`stt-state ${health.model_loaded ? 'stt-state-on' : ''}`}>
              {health.model_loaded ? 'activo · en RAM' : 'inactivo'}
            </span>
          </li>
          {loadedFor(health) && (
            <li>
              <span>cargado hace</span>
              <span className="engine-kv-value">{loadedFor(health)}</span>
            </li>
          )}
          {health.model_load_seconds !== null && (
            <li>
              <span>cargó en</span>
              <span className="engine-kv-value">{health.model_load_seconds.toFixed(1)}s</span>
            </li>
          )}
          <li>
            <span>modo</span>
            <span className="engine-kv-value">
              {health.memory_mode === 'eager' ? 'eager (preload)' : 'lazy (bajo demanda)'}
            </span>
          </li>
        </ul>
        <div className="engine-actions-row">
          <Button
            variant={health.model_loaded ? 'secondary' : 'primary'}
            size="sm"
            disabled={pending}
            isLoading={pending}
            leftIcon={health.model_loaded ? <Upload size={13} /> : <Download size={13} />}
            onClick={toggle}
          >
            {health.model_loaded ? 'Descargar de memoria' : 'Cargar en memoria'}
          </Button>
        </div>
      </div>

      <div className="engine-section">
        <h5>Consumo de memoria</h5>
        <ul className="engine-kv font-mono">
          <li>
            <span>RSS del proceso</span>
            <span className="engine-kv-value">{mb(health.rss_mb)}</span>
          </li>
          <li>
            <span>MLX activo</span>
            <span className="engine-kv-value">{mb(health.metal_active_mb)}</span>
          </li>
          <li>
            <span>MLX pico</span>
            <span className="engine-kv-value">{mb(health.metal_peak_mb)}</span>
          </li>
        </ul>
        <p className="engine-muted">
          El RSS incluye el modelo y el runtime de MLX. Al descargar, MLX libera su cache y el RSS
          puede tardar en bajar (el allocador lo retiene).
        </p>
      </div>

      <div className="engine-section">
        <h5>Servicio</h5>
        <ul className="engine-kv font-mono">
          <li>
            <span>idle TTL</span>
            <span className="engine-kv-value">
              {health.idle_ttl_seconds > 0 ? formatUptime(health.idle_ttl_seconds) : 'sin TTL'}
            </span>
          </li>
          {health.idle_seconds !== null && (
            <li>
              <span>última transcripción hace</span>
              <span className="engine-kv-value">{formatUptime(health.idle_seconds)}</span>
            </li>
          )}
          <li>
            <span>transcripciones</span>
            <span className="engine-kv-value">{health.requests}</span>
          </li>
          <li>
            <span>uptime</span>
            <span className="engine-kv-value">{formatUptime(health.uptime_seconds) ?? '—'}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
