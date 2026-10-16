import { LayoutGrid, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { useModalStore } from '../../../stores/useModalStore';
import { useToastStore } from '../../../stores/useToastStore';
import { PendingAction, ServiceActionRequest, ServiceInfo, ServiceUnit } from '../../../types/service';
import { ServiceKind } from '../../../types/engine';
import { lastLine } from '../../../utils/format';
import { useServiceAction } from '../hooks/useServiceAction';
import { useServices } from '../hooks/useServices';
import { ServiceCard } from './ServiceCard';
import { ServiceDetailModal } from './ServiceDetailModal';
import './ServicesPane.css';

const KIND_LABEL: Record<ServiceKind, string> = {
  llm: 'LLM',
  voice: 'Voz',
  assistant: 'Asistentes',
  api: 'APIs',
  dashboard: 'Dashboards',
  infra: 'Infra',
};

const KIND_ORDER: ServiceKind[] = ['llm', 'voice', 'assistant', 'api', 'dashboard', 'infra'];

export function ServicesPane() {
  const { data, refetch, isFetching } = useServices();
  const { run, isPending, result } = useServiceAction();
  const openConfirm = useModalStore((state) => state.openConfirm);
  const toast = useToastStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [kindFilter, setKindFilter] = useState<ServiceKind | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const services = data?.services ?? [];
  const visible = services.filter(
    (service) =>
      (kindFilter === 'all' || service.kind === kindFilter) &&
      (!tagFilter || service.tags.includes(tagFilter))
  );
  const presentKinds = KIND_ORDER.filter((kind) => services.some((s) => s.kind === kind));
  const allTags = [...new Set(services.flatMap((service) => service.tags))].sort();
  const selected = services.find((service) => service.id === selectedId) ?? null;
  const onCount = services.filter((service) => service.state === 'on').length;
  const totalUnits = services.reduce((sum, service) => sum + service.units_total, 0);

  const execute = async (service: ServiceInfo, payload: ServiceActionRequest) => {
    setPending({
      serviceId: service.id,
      unitId: payload.unit_id,
      actionId: payload.action_id,
      op: payload.op,
    });
    try {
      const res = await run(payload);
      const failed = res.steps.find((step) => step.exit_code !== 0);
      if (res.ok) {
        toast.success(res.steps.map((step) => step.label).join(' → '), service.name);
        if (res.detached && service.self) {
          toast.info('Ran detached: reload this page in a few seconds.', service.name);
        }
      } else {
        const detail = lastLine(failed?.stderr ?? '') || lastLine(failed?.stdout ?? '');
        toast.error(
          detail || `exit code ${failed?.exit_code ?? '?'}`,
          `${service.name} · ${failed?.label ?? 'action'} failed`
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed', service.name);
    } finally {
      setPending(null);
    }
  };

  const confirmThen = (
    service: ServiceInfo,
    title: string,
    message: string,
    payload: ServiceActionRequest
  ) =>
    openConfirm({
      title,
      message,
      confirmLabel: 'Run',
      isDanger: true,
      onConfirm: () => execute(service, payload),
    });

  const handleToggle = (service: ServiceInfo, unit: ServiceUnit, next: boolean) => {
    const payload: ServiceActionRequest = {
      service_id: service.id,
      unit_id: unit.id,
      op: next ? 'start' : 'stop',
    };
    if (next) {
      void execute(service, payload);
      return;
    }
    confirmThen(
      service,
      `Stop ${unit.name}?`,
      `${service.name} · ${unit.name} will be shut down. Anything using it loses the connection.`,
      payload
    );
  };

  const handleRestart = (service: ServiceInfo, unit: ServiceUnit) =>
    confirmThen(
      service,
      `Restart ${unit.name}?`,
      `${service.name} · ${unit.name} will be stopped and started again.`,
      { service_id: service.id, unit_id: unit.id, op: 'restart' }
    );

  const handleAction = (service: ServiceInfo, payload: ServiceActionRequest) => {
    const action = service.actions.find((item) => item.id === payload.action_id);
    if (!action) return;
    if (action.danger || service.self) {
      confirmThen(
        service,
        `${action.label}?`,
        service.self
          ? `${service.name} is this dashboard: it will stop answering until it comes back.`
          : `Run "${action.label}" on ${service.name}?`,
        payload
      );
      return;
    }
    void execute(service, payload);
  };

  return (
    <div className="services-pane">
      <div className="services-toolbar">
        <div className="toolbar-left">
          <LayoutGrid size={15} className="services-icon" />
          <span className="toolbar-title">Services</span>
          <span className="services-counts font-mono" title={data?.root ?? ''}>
            {onCount}/{services.length} on · {totalUnits} units
          </span>
          {data?.root && <span className="services-root font-mono">{data.root}</span>}
        </div>
        <div className="toolbar-right">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => refetch()}
            isLoading={isFetching}
            leftIcon={<RefreshCw size={12} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="services-filters">
        <div className="filter-group" role="group" aria-label="Filtrar por categoría">
          <button
            type="button"
            className={`filter-chip ${kindFilter === 'all' ? 'filter-chip-active' : ''}`}
            onClick={() => setKindFilter('all')}
          >
            Todo <span className="filter-count font-mono">{services.length}</span>
          </button>
          {presentKinds.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`filter-chip ${kindFilter === kind ? 'filter-chip-active' : ''}`}
              onClick={() => setKindFilter(kindFilter === kind ? 'all' : kind)}
            >
              {KIND_LABEL[kind]}{' '}
              <span className="filter-count font-mono">
                {services.filter((s) => s.kind === kind).length}
              </span>
            </button>
          ))}
        </div>

        {allTags.length > 0 && (
          <div className="filter-group filter-group-tags" role="group" aria-label="Filtrar por tag">
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`filter-tag font-mono ${tagFilter === tag ? 'filter-tag-active' : ''}`}
                onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="services-grid">
        {services.length === 0 ? (
          <div className="services-empty">
            <p>No services found in {data?.root ?? 'ROZ_SERVICES_DIR'}.</p>
            <span className="services-empty-sub">
              Drop a <code>roz-service.json</code> manifest inside each service directory to expose
              its units, ports, health check and commands here.
            </span>
          </div>
        ) : visible.length === 0 ? (
          <div className="services-empty">
            <p>
              Ningún servicio con ese filtro
              {tagFilter ? ` (#${tagFilter})` : ''}.
            </p>
            <span className="services-empty-sub">
              Probá con otra categoría o quitá el filtro de tag.
            </span>
          </div>
        ) : (
          visible.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              busyUnit={pending?.serviceId === service.id ? (pending.unitId ?? null) : null}
              busyService={isPending && pending?.serviceId === service.id}
              onOpen={(item) => setSelectedId(item.id)}
              onToggle={handleToggle}
              onRestart={handleRestart}
            />
          ))
        )}
      </div>

      {selected && (
        <ServiceDetailModal
          service={selected}
          pending={pending}
          result={result}
          onClose={() => setSelectedId(null)}
          onAction={handleAction}
        />
      )}
    </div>
  );
}
