import { Save } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { EngineName } from '../../../types/engine';
import { ServiceInfo } from '../../../types/service';
import { EngineAction, useEngineSettings } from '../hooks/useEngine';

type FieldType = 'number' | 'boolean' | 'string' | 'path';

interface EditableField {
  flat: string;
  group: string;
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
}

/** Subconjunto editable del GlobalSettingsRequest de oMLX (la API espera claves planas). */
const EDITABLE: EditableField[] = [
  { flat: 'model_dir', group: 'model', key: 'model_dir', label: 'Base path de modelos', type: 'path', hint: 'Raíz donde oMLX busca modelos (el volumen externo).' },
  { flat: 'hf_cache_path', group: 'huggingface', key: 'hf_cache_path', label: 'Cache de HuggingFace', type: 'path' },
  { flat: 'port', group: 'server', key: 'port', label: 'Puerto', type: 'number' },
  { flat: 'auto_start_on_launch', group: 'server', key: 'auto_start_on_launch', label: 'Arrancar con la app', type: 'boolean' },
  { flat: 'memory_guard_tier', group: 'memory', key: 'memory_guard_tier', label: 'Memory guard', type: 'string' },
  { flat: 'max_concurrent_requests', group: 'scheduler', key: 'max_concurrent_requests', label: 'Peticiones concurrentes', type: 'number' },
  { flat: 'temperature', group: 'sampling', key: 'temperature', label: 'Temperature', type: 'number' },
  { flat: 'top_p', group: 'sampling', key: 'top_p', label: 'top_p', type: 'number' },
  { flat: 'max_tokens', group: 'sampling', key: 'max_tokens', label: 'max_tokens', type: 'number' },
  { flat: 'idle_timeout_seconds', group: 'idle_timeout', key: 'idle_timeout_seconds', label: 'Idle timeout (s)', type: 'number' },
];

/** Motores sin escritura: se muestra todo en modo lectura (Ollama lo gestiona su app). */
const READ_ONLY_ENGINES: EngineName[] = ['ollama', 'splash'];

const seedDraft = (groups: Record<string, Record<string, unknown>>): Record<string, string> => {
  const draft: Record<string, string> = {};
  for (const field of EDITABLE) {
    const value = groups[field.group]?.[field.key];
    if (value !== undefined && value !== null) draft[field.flat] = String(value);
  }
  return draft;
};

const coerce = (raw: string, type: FieldType): unknown => {
  if (type === 'number') return Number(raw);
  if (type === 'boolean') return raw === 'true';
  return raw;
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  if (Array.isArray(value)) return value.join(' · ');
  if (typeof value === 'object') return '{…}';
  return String(value);
};

/** Un grupo puede ser un dict (secciones) o un escalar como `base_path`. */
const isGroup = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

interface ConfigTabProps {
  service: ServiceInfo;
  pending: boolean;
  onAction: (action: EngineAction, label: string) => Promise<void>;
}

export function ConfigTab({ service, pending, onAction }: ConfigTabProps) {
  const { data, isLoading, isError } = useEngineSettings(service.id);
  const groups = data?.groups ?? {};
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [seeded, setSeeded] = useState<unknown>(null);
  const readOnly = READ_ONLY_ENGINES.includes(service.engine as EngineName);

  // Patrón React para "ajustar estado cuando cambian los datos": sin efecto ni render extra.
  if (data && seeded !== data) {
    setSeeded(data);
    setDraft(seedDraft(groups));
  }

  const changed = readOnly
    ? []
    : EDITABLE.filter((field) => {
        const current = groups[field.group]?.[field.key];
        return draft[field.flat] !== undefined && String(current) !== draft[field.flat];
      });

  const save = async () => {
    const patch: Record<string, unknown> = {};
    for (const field of changed) patch[field.flat] = coerce(draft[field.flat] ?? '', field.type);
    await onAction({ kind: 'settings', patch }, `Guardar config (${changed.length} cambios)`);
  };

  if (isLoading) return <p className="engine-muted">Leyendo configuración…</p>;
  if (isError) return <p className="engine-error">No se pudo leer la configuración del motor.</p>;

  const scalarRows = Object.entries(groups).filter(([, value]) => !isGroup(value));
  const dictGroups = Object.entries(groups).filter(([, value]) => isGroup(value));
  const editableGroups = new Set(EDITABLE.filter(() => !readOnly).map((field) => field.group));

  return (
    <div className="engine-tab-body">
      {readOnly ? (
        <p className="engine-muted">
          {service.name} guarda su configuración en su propia app (incluido el <strong>base
          path</strong> de modelos, el host expuesto y el contexto). Roz la muestra en modo lectura:
          para cambiarla, usá la app del motor.
        </p>
      ) : (
        <div className="engine-section">
          <div className="engine-section-head">
            <h5>Ajustes del motor</h5>
            <Button
              variant="secondary"
              size="xs"
              disabled={pending || changed.length === 0}
              isLoading={pending}
              leftIcon={<Save size={11} />}
              onClick={save}
            >
              Guardar {changed.length > 0 ? `(${changed.length})` : ''}
            </Button>
          </div>
          <p className="engine-muted">
            Las rutas deben ser absolutas y existir. Un cambio de puerto o de caché necesita
            reiniciar el motor para aplicarse.
          </p>
          <div className="engine-form">
            {EDITABLE.map((field) => (
              <label key={field.flat} className="engine-field">
                <span title={field.hint}>{field.label}</span>
                <Input
                  value={draft[field.flat] ?? ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [field.flat]: e.target.value }))}
                  className="font-mono"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {scalarRows.length > 0 && (
        <div className="engine-section">
          <h5>Rutas base</h5>
          <ul className="engine-kv font-mono">
            {scalarRows.map(([key, value]) => (
              <li key={key}>
                <span>{key}</span>
                <span className="engine-kv-value">{formatValue(value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="engine-section">
        <h5>{readOnly ? 'Configuración del motor' : 'Resto de la configuración (solo lectura)'}</h5>
        {dictGroups.map(([group, values]) => (
          <details key={group} className="engine-group" open={readOnly}>
            <summary>
              {group}
              {editableGroups.has(group) ? ' (editable arriba)' : ''}
            </summary>
            <ul className="engine-kv font-mono">
              {Object.entries(values).map(([key, value]) => (
                <li key={key}>
                  <span>{key}</span>
                  <span className="engine-kv-value">{formatValue(value)}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}
