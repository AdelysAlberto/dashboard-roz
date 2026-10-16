import { RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { EngineMetrics, EngineName } from '../../../types/engine';
import { ServiceInfo } from '../../../types/service';
import { useEngineMetrics, useEngineModels, useEngineTasks } from '../hooks/useEngine';

interface MetricsTabProps {
  service: ServiceInfo;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const renderValue = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return Array.isArray(value) ? `${value.length} items` : '{…}';
  return String(value);
};

export function MetricsTab({ service }: MetricsTabProps) {
  const engine = service.engine as EngineName;
  const metrics = useEngineMetrics(service.id, engine !== 'splash');
  const models = useEngineModels(service.id, engine === 'splash');
  const tasks = useEngineTasks(service.id, engine === 'ollama');

  if (engine === 'splash') {
    const pid = models.data?.models?.[0];
    return (
      <div className="engine-tab-body">
        <div className="engine-section">
          <div className="engine-section-head">
            <h5>Estado del lanzador</h5>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => models.refetch()}
              isLoading={models.isFetching}
              leftIcon={<RefreshCw size={11} />}
            >
              Refrescar
            </Button>
          </div>
          <ul className="engine-kv font-mono">
            <li>
              <span>serving</span>
              <span className="engine-kv-value">{models.isSuccess ? 'sí' : 'no'}</span>
            </li>
            <li>
              <span>modelo</span>
              <span className="engine-kv-value">{pid?.id ?? '—'}</span>
            </li>
            <li>
              <span>puerto</span>
              <span className="engine-kv-value">
                {service.units[0]?.port ?? '—'}
              </span>
            </li>
          </ul>
          <p className="engine-muted">
            Splash sirve un modelo por proceso: usá la pestaña Lanzar para arrancarlo y el
            interruptor de la tarjeta para pararlo.
          </p>
        </div>
      </div>
    );
  }

  const data = (metrics.data ?? {}) as EngineMetrics;

  return (
    <div className="engine-tab-body">
      {engine === 'ollama' && (
        <div className="engine-section">
          <h5>En memoria</h5>
          <ul className="engine-kv font-mono">
            {(models.data?.loaded ?? []).map((m) => (
              <li key={m.id}>
                <span>{m.name ?? m.id}</span>
                <span className="engine-kv-value">
                  {m.size_vram ?? '—'}
                  {m.expires_at ? ` · expira ${m.expires_at}` : ''}
                </span>
              </li>
            ))}
            {(models.data?.loaded ?? []).length === 0 && (
              <li>
                <span>ningún modelo cargado</span>
                <span className="engine-kv-value">—</span>
              </li>
            )}
          </ul>
          {(tasks.data?.local.length ?? 0) > 0 && (
            <p className="engine-muted">
              {tasks.data?.local.length} descarga(s) en curso.
            </p>
          )}
        </div>
      )}

      {metrics.isLoading && <p className="engine-muted">Leyendo métricas…</p>}
      {metrics.isError && <p className="engine-error">El motor no respondió a las métricas.</p>}

      {Object.entries(asRecord(data))
        .filter(([, value]) => value && typeof value === 'object')
        .map(([section, value]) => {
          const rows = asRecord(value);
          const scalar = Object.entries(rows).filter(([, v]) => typeof v !== 'object');
          if (scalar.length === 0) return null;
          return (
            <div key={section} className="engine-section">
              <h5>{section}</h5>
              <ul className="engine-kv font-mono">
                {scalar.slice(0, 24).map(([key, item]) => (
                  <li key={key}>
                    <span>{key}</span>
                    <span className="engine-kv-value">{renderValue(item)}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
    </div>
  );
}
