import { RotateCw } from 'lucide-react';
import { Switch } from '../../../components/ui/Switch';
import { ServiceInfo, ServiceState, ServiceUnit, ServiceUnitState } from '../../../types/service';
import './service-status.css';
import './ServiceCard.css';

const UNIT_LABEL: Record<ServiceUnitState, string> = {
  up: 'up',
  partial: 'partial',
  booting: 'booting',
  down: 'down',
  unexpected: 'port taken',
  unknown: 'no probe',
};

const CARD_LABEL: Record<ServiceState, string> = {
  on: 'all on',
  partial: 'degraded',
  off: 'all off',
  unknown: 'not probeable',
};

const isIntentOn = (state: ServiceUnitState) =>
  state === 'up' || state === 'partial' || state === 'booting';

const summaryOf = (service: ServiceInfo) => {
  if (service.state === 'unknown') return 'no probe';
  if (service.state === 'off') return 'all off';
  return `${service.units_on}/${service.units_total} on`;
};

interface ServiceCardProps {
  service: ServiceInfo;
  busyUnit: string | null;
  busyService: boolean;
  onOpen: (service: ServiceInfo) => void;
  onToggle: (service: ServiceInfo, unit: ServiceUnit, next: boolean) => void;
  onRestart: (service: ServiceInfo, unit: ServiceUnit) => void;
}

export function ServiceCard({
  service,
  busyUnit,
  busyService,
  onOpen,
  onToggle,
  onRestart,
}: ServiceCardProps) {
  const ports = [...new Set(service.units.flatMap((unit) => unit.ports))];

  return (
    <article className={`service-card card-state-${service.state}`}>
      <button
        type="button"
        className="service-card-open"
        onClick={() => onOpen(service)}
        aria-label={`Open ${service.name} details`}
      >
        <span className="card-head-row">
          <span className="card-identity">
            <span className={`state-dot dot-${service.state}`} aria-hidden="true" />
            <span className="card-name">{service.name}</span>
            {service.self && <span className="card-flag font-mono">self</span>}
          </span>
          <span
            className={`card-summary font-mono summary-${service.state}`}
            title={CARD_LABEL[service.state]}
          >
            {summaryOf(service)}
          </span>
        </span>

        {service.description && <span className="card-desc">{service.description}</span>}

        <span className="card-portline font-mono">
          <span>
            {ports.length > 0 ? ports.map((port) => `:${port}`).join(' · ') : 'no port declared'}
          </span>
          {service.tags.length > 0 && (
            <span className="card-tags">
              {service.tags.map((tag) => (
                <span key={tag} className="card-tag font-mono">
                  {tag}
                </span>
              ))}
            </span>
          )}
        </span>
      </button>

      <ul className="unit-list">
        {service.units.map((unit) => {
          const busy = busyUnit === `${service.id}:${unit.id}`;
          const on = isIntentOn(unit.state);
          const canToggle = unit.ports.length > 0 && unit.ops.includes(on ? 'stop' : 'start');
          return (
            <li key={unit.id} className={`unit-row unit-state-${unit.state}`}>
              <span className="unit-identity">
                <span className={`unit-dot dot-${unit.state}`} aria-hidden="true" />
                <span className="unit-name" title={unit.detail ?? undefined}>
                  {unit.name}
                </span>
              </span>
              <span className="unit-state font-mono" title={unit.detail ?? undefined}>
                {UNIT_LABEL[unit.state]}
              </span>
              <span className="unit-actions">
                {unit.ops.includes('restart') && (
                  <button
                    type="button"
                    className="unit-icon-btn"
                    aria-label={`Restart ${unit.name}`}
                    title={`Restart ${unit.name}`}
                    disabled={busy || busyService}
                    onClick={() => onRestart(service, unit)}
                  >
                    <RotateCw size={12} />
                  </button>
                )}
                <Switch
                  checked={on}
                  busy={busy}
                  disabled={!canToggle || busyService}
                  label={`${on ? 'Stop' : 'Start'} ${unit.name} of ${service.name}`}
                  onChange={(next) => onToggle(service, unit, next)}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
