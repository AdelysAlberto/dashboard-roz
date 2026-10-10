import { Coins, Cpu, MessageSquare, Terminal, TrendingUp, Zap } from 'lucide-react';
import React from 'react';
import { SubagentSession } from '../../../types/pilot';
import './SessionCard.css';

interface SessionCardProps {
  session: SubagentSession;
  onSelect: (session: SubagentSession) => void;
}

const STATE_META: Record<string, { label: string }> = {
  active: { label: 'Working' },
  stalled: { label: 'Unresponsive' },
  quiet: { label: 'Idle' },
  ended: { label: 'Ended' },
};

const formatTokens = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

const formatAge = (sec: number) => {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
};

export const SessionCard: React.FC<SessionCardProps> = ({ session, onSelect }) => {
  const stateMeta = STATE_META[session.state] || { label: session.state };
  const providerLabel = session.provider === 'opencode' ? 'OpenCode' : 'Pi';
  const isPrimary = session.kind === 'primary';

  return (
    <button
      className={`session-card card-state-${session.state}`}
      onClick={() => onSelect(session)}
      aria-label={`Open ${isPrimary ? session.project || 'session' : session.agent} — ${stateMeta.label}`}
    >
      <div className="card-header-row">
        <span className="card-identity">
          <span className={`state-dot state-dot-${session.state}`} aria-hidden="true" />
          {isPrimary ? <Terminal size={13} className="card-primary-icon" /> : null}
          <span className="card-agent-name">{isPrimary ? session.project || 'Session' : `@${session.agent}`}</span>
        </span>
        <span className="card-state-label">{stateMeta.label}</span>
      </div>

      <div className="card-model-line font-mono">
        {session.model ? <span className="card-model-name">{session.model}</span> : <span className="card-model-unknown">no model</span>}
        <span className="card-model-sep" aria-hidden="true">·</span>
        <span className={`card-provider card-provider-${session.provider === 'opencode' ? 'opencode' : 'pi'}`}>{providerLabel}</span>
        {session.task_tag && <span className="card-task-tag font-mono">{session.task_tag}</span>}
      </div>

      <p className="card-task-preview">{session.task || 'No task declared'}</p>

      {session.last_activity && (
        <div className="card-activity-line font-mono">
          <Zap size={11} className="card-activity-icon" aria-hidden="true" />
          <span>{session.last_activity}</span>
        </div>
      )}

      <div className="card-footer-row">
        <span className="card-footer-metric" title="Messages">
          <MessageSquare size={11} aria-hidden="true" /> {session.messages}
        </span>
        <span className="card-footer-metric" title="Tokens">
          <Cpu size={11} aria-hidden="true" /> {formatTokens(session.tokens)}
        </span>
        {!!session.cost && (
          <span className="card-footer-metric" title="Cost">
            <Coins size={11} aria-hidden="true" /> ${session.cost.toFixed(2)}
          </span>
        )}
        <span className={`card-footer-age age-${session.state}`} title="Idle time">
          <TrendingUp size={11} aria-hidden="true" /> {formatAge(session.idle_seconds)}
        </span>
      </div>
    </button>
  );
};
