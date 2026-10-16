import { ExternalLink, FileText, Play, RotateCw, Square } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import {
  PendingAction,
  ServiceActionRequest,
  ServiceActionResult,
  ServiceInfo,
  ServiceUnit,
} from '../../../types/service';
import { formatUptime } from '../../../utils/format';
import { MarkdownRenderer } from '../../documents/components/MarkdownRenderer';
import { EnginePanel } from '../../engines/components/EnginePanel';
import { useServiceDocs } from '../hooks/useServices';
import './ServiceDetailModal.css';

const UNIT_LABEL: Record<string, string> = {
  up: 'up',
  partial: 'partial',
  booting: 'booting',
  down: 'down',
  unexpected: 'port taken',
  unknown: 'no probe',
};

interface ServiceDetailModalProps {
  service: ServiceInfo;
  pending: PendingAction | null;
  result: ServiceActionResult | null;
  onClose: () => void;
  onAction: (service: ServiceInfo, payload: ServiceActionRequest) => void;
}

export function ServiceDetailModal({
  service,
  pending,
  result,
  onClose,
  onAction,
}: ServiceDetailModalProps) {
  const [showDocs, setShowDocs] = useState(false);
  const { data: docs, isFetching: isLoadingDocs } = useServiceDocs(service.id, showDocs);
  const busy = pending?.serviceId === service.id;
  const unitBusy = (unit: ServiceUnit) => busy && pending?.unitId === unit.id;

  return (
    <Modal isOpen size="lg" onClose={onClose} title={service.name}>
      <div className="svc-detail">
        {service.description && <p className="svc-description">{service.description}</p>}

        <dl className="svc-meta font-mono">
          <div className="svc-meta-row">
            <dt>dir</dt>
            <dd title={service.dir}>{service.dir}</dd>
          </div>
          {service.docs && (
            <div className="svc-meta-row">
              <dt>docs</dt>
              <dd title={service.docs}>{service.docs}</dd>
            </div>
          )}
          {service.tags.length > 0 && (
            <div className="svc-meta-row">
              <dt>tags</dt>
              <dd>{service.tags.join(' · ')}</dd>
            </div>
          )}
        </dl>

        <table className="svc-units">
          <thead>
            <tr>
              <th scope="col">Unit</th>
              <th scope="col">State</th>
              <th scope="col">Ports</th>
              <th scope="col">PID</th>
              <th scope="col">Uptime</th>
              <th scope="col" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {service.units.map((unit) => (
              <tr key={unit.id} className={`svc-unit-row unit-state-${unit.state}`}>
                <th scope="row">
                  <span className={`unit-dot dot-${unit.state}`} aria-hidden="true" />
                  <span className="svc-unit-name">{unit.name}</span>
                </th>
                <td className={`font-mono unit-state unit-state-${unit.state}`} title={unit.detail ?? undefined}>
                  {UNIT_LABEL[unit.state] ?? unit.state}
                </td>
                <td className="font-mono">
                  {unit.ports.length > 0 ? unit.ports.map((p) => `:${p}`).join(' · ') : '—'}
                </td>
                <td className="font-mono">{unit.pid ?? '—'}</td>
                <td className="font-mono">{formatUptime(unit.uptime_sec) ?? '—'}</td>
                <td>
                  <span className="svc-unit-actions">
                    {unit.ops.includes('start') && unit.state !== 'up' && (
                      <Button
                        variant="ghost"
                        size="xs"
                        aria-label={`Start ${unit.name}`}
                        title={`Start ${unit.name}`}
                        isLoading={unitBusy(unit) && pending?.op === 'start'}
                        disabled={busy}
                        leftIcon={<Play size={12} />}
                        onClick={() =>
                          onAction(service, { service_id: service.id, unit_id: unit.id, op: 'start' })
                        }
                      >
                        Start
                      </Button>
                    )}
                    {unit.ops.includes('stop') && unit.state !== 'down' && (
                      <Button
                        variant="ghost"
                        size="xs"
                        aria-label={`Stop ${unit.name}`}
                        title={`Stop ${unit.name}`}
                        isLoading={unitBusy(unit) && pending?.op === 'stop'}
                        disabled={busy}
                        leftIcon={<Square size={12} />}
                        onClick={() =>
                          onAction(service, { service_id: service.id, unit_id: unit.id, op: 'stop' })
                        }
                      >
                        Stop
                      </Button>
                    )}
                    {unit.ops.includes('restart') && (
                      <Button
                        variant="ghost"
                        size="xs"
                        aria-label={`Restart ${unit.name}`}
                        title={`Restart ${unit.name}`}
                        disabled={busy}
                        leftIcon={<RotateCw size={12} />}
                        onClick={() =>
                          onAction(service, {
                            service_id: service.id,
                            unit_id: unit.id,
                            op: 'restart',
                          })
                        }
                      />
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {service.engine && <EnginePanel service={service} />}

        {service.actions.length > 0 && (
          <section className="svc-actions">
            <h4 className="svc-section-title">Actions</h4>
            <div className="svc-action-row">
              {service.actions.map((action) => (
                <Button
                  key={action.id}
                  variant={action.danger ? 'danger' : 'secondary'}
                  size="sm"
                  disabled={busy}
                  isLoading={busy && pending?.actionId === action.id}
                  onClick={() => onAction(service, { service_id: service.id, action_id: action.id })}
                >
                  {action.label}
                </Button>
              ))}
              {service.url && (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<ExternalLink size={13} />}
                  onClick={() => window.open(service.url as string, '_blank', 'noopener,noreferrer')}
                >
                  Open
                </Button>
              )}
              {service.has_docs && (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<FileText size={13} />}
                  onClick={() => setShowDocs((value) => !value)}
                >
                  {showDocs ? 'Hide docs' : 'Show docs'}
                </Button>
              )}
            </div>
          </section>
        )}

        {result && result.service === service.id && (
          <section className="svc-output">
            <h4 className="svc-section-title">
              Last action {result.ok ? 'succeeded' : 'failed'}
              {result.detached ? ' · detached' : ''}
            </h4>
            {result.steps.map((step) => (
              <div key={`${step.label}-${step.command}`} className="svc-step">
                <div className="svc-step-head font-mono">
                  <span className="svc-step-label">{step.label}</span>
                  <span className="svc-step-meta">
                    exit {step.exit_code} · {step.duration_ms}ms
                  </span>
                </div>
                <code className="svc-command font-mono">$ {step.command}</code>
                {step.stderr.trim() !== '' && (
                  <pre className="svc-stream svc-stream-err">{step.stderr}</pre>
                )}
                {step.stderr.trim() === '' && step.stdout.trim() !== '' && (
                  <pre className="svc-stream">{step.stdout}</pre>
                )}
              </div>
            ))}
          </section>
        )}

        {showDocs && (
          <section className="svc-docs">
            {isLoadingDocs && <p className="svc-docs-loading">Loading {service.docs}…</p>}
            {!isLoadingDocs && docs && <MarkdownRenderer content={docs.content} />}
          </section>
        )}
      </div>
    </Modal>
  );
}
