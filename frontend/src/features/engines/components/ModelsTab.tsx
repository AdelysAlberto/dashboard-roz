import { Download, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { EngineName } from '../../../types/engine';
import { ServiceInfo } from '../../../types/service';
import { EngineAction, useEngineModels, useEngineTasks, useHfSearch } from '../hooks/useEngine';

interface ModelsTabProps {
  service: ServiceInfo;
  pending: boolean;
  onAction: (action: EngineAction, label: string) => Promise<void>;
}

export function ModelsTab({ service, pending, onAction }: ModelsTabProps) {
  const engine = service.engine as EngineName;
  const { data, isLoading, refetch, isFetching } = useEngineModels(service.id);
  const { data: tasks } = useEngineTasks(service.id);
  const [query, setQuery] = useState('');
  const [repo, setRepo] = useState('');
  const hf = useHfSearch(service.id, engine === 'omlx' ? query : '');

  const models = data?.models ?? [];
  const loaded = models.filter((m) => m.loaded || m.loading);
  const localTasks = (tasks?.local ?? []).filter((t) => t.state === 'running');
  const remoteTasks = (tasks?.remote ?? []).filter((t) => t.state === 'running');

  return (
    <div className="engine-tab-body">
      <div className="engine-section">
        <div className="engine-section-head">
          <h5>En disco ({models.length})</h5>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => refetch()}
            isLoading={isFetching}
            leftIcon={<RefreshCw size={11} />}
          >
            Refrescar
          </Button>
        </div>

        {isLoading && <p className="engine-muted">Leyendo inventario…</p>}
        {!isLoading && models.length === 0 && (
          <p className="engine-muted">
            Sin modelos en disco. Descargá uno abajo para empezar.
          </p>
        )}

        <ul className="engine-models">
          {(loaded.length > 0 ? loaded : []).concat(models.filter((m) => !m.loaded && !m.loading)).map((model) => (
            <li key={model.id} className={`engine-model ${model.loaded ? 'is-loaded' : ''}`}>
              <span className="engine-model-name" title={model.source ?? model.id}>
                {model.name}
              </span>
              <span className="engine-model-meta font-mono">
                {model.parameter_size ?? model.type ?? ''}
                {model.quantization ? ` · ${model.quantization}` : ''}
                {(model.size ?? model.size_vram) ? ` · ${model.size ?? model.size_vram}` : ''}
                {model.context ? ` · ${Math.round(model.context / 1024)}k ctx` : ''}
              </span>
              <span className="engine-model-state font-mono">
                {model.loading ? 'cargando' : model.loaded ? 'en RAM' : model.default ? 'default' : ''}
              </span>
              <span className="engine-model-actions">
                {engine === 'omlx' && (
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={pending}
                    onClick={() =>
                      onAction(
                        { kind: 'model', model_id: model.id, op: model.loaded ? 'unload' : 'load' },
                        `${model.loaded ? 'Descargar' : 'Cargar'} ${model.name}`
                      )
                    }
                  >
                    {model.loaded ? 'Unload' : 'Load'}
                  </Button>
                )}
                {engine === 'ollama' && (
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={pending}
                    leftIcon={<Trash2 size={11} />}
                    title={`Borrar ${model.name}`}
                    onClick={() =>
                      onAction({ kind: 'model', model_id: model.id, op: 'delete' }, `Borrar ${model.name}`)
                    }
                  />
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="engine-section">
        <h5>{engine === 'omlx' ? 'Descargar de HuggingFace' : 'Descargar (ollama pull)'}</h5>
        {engine === 'omlx' ? (
          <>
            <Input
              placeholder="Buscar repo (ej. mlx-community/Qwen3-8B-4bit)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              leftIcon={<Search size={13} />}
            />
            {hf.isFetching && <p className="engine-muted">Buscando…</p>}
            <ul className="engine-hf">
              {(hf.data?.results ?? []).slice(0, 8).map((item) => {
                const repoId = item.id ?? item.modelId ?? item.repo_id ?? '';
                return (
                  <li key={repoId}>
                    <span className="font-mono">{repoId}</span>
                    <span className="engine-model-meta font-mono">
                      {item.downloads ? `${item.downloads} descargas` : ''}
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={pending || !repoId}
                      leftIcon={<Download size={11} />}
                      onClick={() => onAction({ kind: 'download', repo_id: repoId }, `Descargar ${repoId}`)}
                    >
                      Descargar
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="engine-inline-form">
            <Input
              placeholder="modelo (ej. llama3.2:3b)"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              leftIcon={<Download size={13} />}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={pending || repo.trim().length < 2}
              onClick={() => onAction({ kind: 'pull', name: repo.trim() }, `Pull ${repo.trim()}`)}
            >
              Descargar
            </Button>
          </div>
        )}

        {(localTasks.length > 0 || remoteTasks.length > 0) && (
          <ul className="engine-tasks">
            {[...localTasks, ...remoteTasks].map((task) => (
              <li key={task.id}>
                <span className="font-mono">{task.label}</span>
                <progress className="engine-progress" value={Math.round(task.progress)} max={100} />
                <span className="engine-model-meta font-mono">
                  {Math.round(task.progress)}% · {task.detail || task.state}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
