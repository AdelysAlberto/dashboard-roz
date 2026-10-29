import { Cpu, Power, RefreshCw, Sparkles } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { useImageTestStore } from '../../../stores/useImageTestStore';
import { LocalModelStatus, LocalWorkerState } from '../../../types/imageTest';
import { useLocalModelActions, useLocalModels, useLocalModelStatus } from '../hooks/useLocalModel';
import { formatBytes, formatMs, modelFolderName, samePath } from '../utils';

const STATE_LABEL: Record<LocalWorkerState, string> = {
  idle: 'not loaded',
  loading: 'loading',
  ready: 'loaded',
  generating: 'generating',
  error: 'failed',
};

const STATE_BADGE: Record<LocalWorkerState, string> = {
  idle: 'neutral',
  loading: 'amber',
  ready: 'done',
  generating: 'in-progress',
  error: 'rejected',
};

function metaLine(status: LocalModelStatus | undefined, folderName: string): string {
  if (!status) return 'asking the server…';
  if (status.state === 'loading') return status.phase === 'warmup' ? 'materialising weights…' : 'constructing…';
  if (status.state === 'generating') return `${status.name ?? folderName} · diffusing`;
  if (status.state === 'error') return status.name ?? folderName;
  if (!status.loaded) return 'no checkpoint in RAM';
  const parts = [status.name ?? folderName];
  if (status.bits) parts.push(`${status.bits}-bit`);
  if (status.load_ms !== null) parts.push(`load ${formatMs(status.load_ms)}`);
  if (status.warmup_ms) parts.push(`warmup ${formatMs(status.warmup_ms)}`);
  return parts.join(' · ');
}

/** The badge describes the worker, never the selection: green means one
 * checkpoint is resident, and it says which. */
function badgeLabel(status: LocalModelStatus | undefined): string {
  if (!status) return 'asking…';
  const state = status.state;
  if (state === 'ready') return `loaded · ${status.name ?? 'checkpoint'}`;
  if (state === 'generating') return `generating · ${status.name ?? 'checkpoint'}`;
  if (state === 'loading') return `loading · ${status.name ?? 'checkpoint'}`;
  return STATE_LABEL[state];
}

/**
 * Local mflux checkpoint: pick a folder, load it into a resident worker, then
 * generate. No HTTP endpoint is involved, which is why the Endpoint group of the
 * form disappears when this backend is chosen.
 */
export function LocalModelCard() {
  const draft = useImageTestStore((state) => state.draft);
  const patch = useImageTestStore((state) => state.patch);
  const { data: status } = useLocalModelStatus();
  const { data: catalog, isFetching, refetch } = useLocalModels();
  const { load, unload, isWorking } = useLocalModelActions();

  const path = draft.local_path.trim();
  const folderName = modelFolderName(path);
  const state = status?.state ?? 'idle';
  const busy = state === 'loading' || state === 'generating';
  const known = catalog?.models.find((model) => model.path === path);
  const loadedPath = status?.loaded ? status.path : null;
  const sameAsLoaded = samePath(loadedPath, path);
  const otherLoaded = Boolean(loadedPath) && !sameAsLoaded;
  const canLoad = Boolean(path) && !busy && !isWorking && !sameAsLoaded && (known ? known.compatible : true);
  const options = [
    { value: '', label: 'custom path…' },
    ...(catalog?.models ?? [])
      .filter((model) => model.compatible)
      .map((model) => ({ value: model.path, label: `${model.name} · ${formatBytes(model.size_bytes)}` })),
  ];
  const family = status?.family ?? known?.family ?? null;

  return (
    <section className="it-group it-local">
      <div className="it-group-head">
        <h3 className="it-group-title">Local model</h3>
        <div className="it-group-tools">
          <Badge variant={STATE_BADGE[state]} size="xs" dot>
            {badgeLabel(status)}
          </Badge>
          <Button
            variant="ghost"
            size="xs"
            leftIcon={<RefreshCw size={11} />}
            isLoading={isFetching}
            disabled={isFetching}
            onClick={() => void refetch()}
            title={`Re-scan ${catalog?.root ?? 'the models folder'} for new checkpoints`}
          >
            Refresh
          </Button>
        </div>
      </div>

      <p className="it-local-meta font-mono" title={status?.path ?? undefined}>
        {metaLine(status, folderName)}
      </p>

      {status?.loaded && (
        <p className={`it-local-swap${otherLoaded ? ' it-local-swap-warn' : ''}`}>
          {otherLoaded ? (
            <>
              The worker holds <strong>{status.name}</strong>. Load replaces it: the current
              checkpoint is unloaded first, then the selected one is warmed up.
            </>
          ) : (
            <>
              <strong>{folderName}</strong> is in RAM. Generate uses it, and any other
              checkpoint has to be loaded first.
            </>
          )}
        </p>
      )}

      <Select
        label="Checkpoints found"
        options={options}
        value={options.some((option) => option.value === path) ? path : ''}
        onChange={(event) => patch({ local_path: event.target.value })}
        disabled={busy}
      />
      <Input
        label="Model folder"
        value={draft.local_path}
        onChange={(event) => patch({ local_path: event.target.value })}
        placeholder={catalog?.default_path ?? '/path/to/Qwen-Image-2512-3bit'}
        hint="mflux --model-path"
        spellCheck={false}
        autoComplete="off"
        disabled={busy}
      />

      <div className="it-local-actions">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Cpu size={13} />}
          isLoading={state === 'loading' || isWorking}
          disabled={!canLoad}
          onClick={() => load(path)}
          title={
            sameAsLoaded
              ? 'This checkpoint is already in RAM'
              : busy
                ? 'The worker is busy: wait for it to finish'
                : undefined
          }
        >
          {sameAsLoaded ? 'Loaded' : otherLoaded ? 'Load selected' : 'Load model'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Power size={13} />}
          disabled={!status?.loaded || state === 'generating' || isWorking}
          onClick={() => unload()}
        >
          Unload
        </Button>
      </div>

      {family === 'qwen-image-2.1' && (
        <p className="it-note">
          2.1 loads through mflux's own class and takes guidance around 1.0; the rail is
          sending {draft.guidance || '─'}.
        </p>
      )}

      {known && !known.compatible && (
        <Alert variant="warning" title="That folder cannot run">
          <p className="it-local-msg">{known.reason}</p>
        </Alert>
      )}

      {status?.available === false && (
        <Alert variant="error" title="mflux is not installed">
          <p className="it-local-msg font-mono">{status.python}</p>
          <p className="it-local-msg">
            uv venv ~/.venvs/mflux &amp;&amp; uv pip install --python ~/.venvs/mflux/bin/python mflux
            &quot;pillow&lt;13&quot;
          </p>
        </Alert>
      )}

      {status?.error && (
        <Alert variant="error" title="The worker failed">
          <p className="it-local-msg font-mono">{status.error}</p>
        </Alert>
      )}

      {status?.warning && (
        <Alert variant="warning" title="Loaded without a warmup">
          <p className="it-local-msg font-mono">{status.warning}</p>
          <p className="it-local-msg">
            The first generation will pay the weight load on its first step.
          </p>
        </Alert>
      )}

      <p className="it-note">
        <Sparkles size={11} className="it-local-icon" />
        Roz spawns one mflux worker and keeps the checkpoint in RAM, because mlx loads
        lazily: without the warmup “loaded” would only mean “constructed”. One model at a
        time — 22 GB twice is a swap storm. Refresh re-scans the folder, so a checkpoint
        downloaded while this tab is open shows up in the list.
      </p>
    </section>
  );
}
