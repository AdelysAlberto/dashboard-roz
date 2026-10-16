import { Activity, AudioLines, Boxes, FileText, Rocket, RotateCw, Settings2 } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { useToastStore } from '../../../stores/useToastStore';
import { EngineName } from '../../../types/engine';
import { ServiceInfo } from '../../../types/service';
import { lastLine } from '../../../utils/format';
import { EngineAction, useEngineAction, useEngineLogs } from '../hooks/useEngine';
import { ConfigTab } from './ConfigTab';
import { LaunchTab } from './LaunchTab';
import { MetricsTab } from './MetricsTab';
import { ModelsTab } from './ModelsTab';
import { SttTab } from './SttTab';
import { VoicesTab } from './VoicesTab';
import './EnginePanel.css';

type TabId = 'models' | 'config' | 'metrics' | 'launch' | 'logs' | 'voices' | 'stt';

interface TabDef {
  id: TabId;
  label: string;
  icon: ReactNode;
}

const TABS: Record<EngineName, TabDef[]> = {
  omlx: [
    { id: 'models', label: 'Modelos', icon: <Boxes size={12} /> },
    { id: 'config', label: 'Config', icon: <Settings2 size={12} /> },
    { id: 'metrics', label: 'Métricas', icon: <Activity size={12} /> },
    { id: 'logs', label: 'Logs', icon: <FileText size={12} /> },
  ],
  ollama: [
    { id: 'models', label: 'Modelos', icon: <Boxes size={12} /> },
    { id: 'config', label: 'Config', icon: <Settings2 size={12} /> },
    { id: 'metrics', label: 'Métricas', icon: <Activity size={12} /> },
  ],
  splash: [
    { id: 'launch', label: 'Lanzar', icon: <Rocket size={12} /> },
    { id: 'metrics', label: 'Estado', icon: <Activity size={12} /> },
    { id: 'logs', label: 'Logs', icon: <FileText size={12} /> },
  ],
  kokoro: [
    { id: 'voices', label: 'Voces', icon: <AudioLines size={12} /> },
    { id: 'metrics', label: 'Estado', icon: <Activity size={12} /> },
    { id: 'logs', label: 'Logs', icon: <FileText size={12} /> },
  ],
  whisper: [
    { id: 'stt', label: 'Estado', icon: <Activity size={12} /> },
    { id: 'logs', label: 'Logs', icon: <FileText size={12} /> },
  ],
};

const describe = (res: unknown): string => {
  if (res && typeof res === 'object' && 'output' in res) {
    const out = lastLine(String((res as { output?: string }).output ?? ''));
    if (out) return out;
  }
  return 'ok';
};

interface EnginePanelProps {
  service: ServiceInfo;
}

export function EnginePanel({ service }: EnginePanelProps) {
  const engine = service.engine as EngineName;
  const tabs = TABS[engine] ?? [];
  const [tab, setTab] = useState<TabId>(tabs[0]?.id ?? 'models');
  const { run, isPending } = useEngineAction(service.id);
  const toast = useToastStore();
  const logs = useEngineLogs(service.id, 160, tab === 'logs');

  const onAction = async (action: EngineAction, label: string) => {
    try {
      const res = await run(action);
      toast.success(describe(res), `${service.name} · ${label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'acción fallida', `${service.name} · ${label}`);
    }
  };

  const restartEngine = () =>
    onAction({ kind: 'restart' }, 'Reiniciar motor');

  return (
    <section className="engine-panel">
      <header className="engine-tabs-row">
        <div className="engine-tabs" role="tablist">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`engine-tab ${tab === item.id ? 'engine-tab-active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="xs"
          onClick={restartEngine}
          isLoading={isPending}
          leftIcon={<RotateCw size={12} />}
          title={`Reiniciar ${service.name} de forma segura`}
        >
          Restart
        </Button>
      </header>

      {tab === 'models' && <ModelsTab service={service} pending={isPending} onAction={onAction} />}
      {tab === 'config' && <ConfigTab service={service} pending={isPending} onAction={onAction} />}
      {tab === 'metrics' && <MetricsTab service={service} />}
      {tab === 'launch' && <LaunchTab service={service} pending={isPending} onAction={onAction} />}
      {tab === 'voices' && <VoicesTab service={service} />}
      {tab === 'stt' && (
        <SttTab service={service} pending={isPending} onAction={onAction} />
      )}
      {tab === 'logs' && (
        <div className="engine-logs">
          {logs.isLoading && <p className="engine-muted">Cargando logs…</p>}
          {logs.data && <pre className="engine-pre">{logs.data.lines || '(sin salida)'}</pre>}
          {logs.isError && <p className="engine-error">No se pudieron leer los logs del motor.</p>}
        </div>
      )}
    </section>
  );
}
