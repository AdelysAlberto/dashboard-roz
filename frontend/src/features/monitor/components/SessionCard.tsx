import { Activity, Clock, Cpu, MessageSquare } from 'lucide-react';
import React from 'react';
import { Badge } from '../../../components/ui/Badge';
import { SubagentSession } from '../../../types/pilot';
import './SessionCard.css';

interface SessionCardProps {
  session: SubagentSession;
  onSelect: (session: SubagentSession) => void;
}

const STATE_LABELS: Record<string, { label: string; variant: string }> = {
  active: { label: 'Working', variant: 'done' },
  stalled: { label: 'Unresponsive', variant: 'rejected' },
  quiet: { label: 'Idle', variant: 'pending' },
  ended: { label: 'Ended', variant: 'neutral' },
};

export const SessionCard: React.FC<SessionCardProps> = ({ session, onSelect }) => {
  const stateMeta = STATE_LABELS[session.state] || { label: session.state, variant: 'neutral' };

  const formatTokens = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const formatAge = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}min`;
    return `${Math.floor(sec / 3600)}h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
  };

  return (
    <button className={`session-card card-state-${session.state}`} onClick={() => onSelect(session)}>
      <div className="card-top-row">
        <span className="card-agent-name">
          {session.kind === 'primary' ? `◉ ${session.project || 'Session'}` : `@${session.agent}`}
        </span>
        <Badge variant={session.provider === 'opencode' ? 'opencode' : 'pi'} size="xs">
          {session.provider === 'opencode' ? 'OpenCode' : 'Pi'}
        </Badge>
        <Badge variant={stateMeta.variant} size="xs" dot>
          {stateMeta.label}
        </Badge>
        {session.task_tag && <Badge variant="purple" size="xs">{session.task_tag}</Badge>}
        {session.kind === 'primary' && <Badge variant="neutral" size="xs">Terminal</Badge>}
      </div>

      <div className="card-task-preview">{session.task || 'No task declared'}</div>

      {session.last_activity && (
        <div className="card-activity-line">
          <Activity size={12} />
          <span>{session.last_activity}</span>
        </div>
      )}

      <div className="card-meta-row font-mono">
        <span title="Messages">
          <MessageSquare size={12} /> {session.messages} msgs
        </span>
        <span title="Tokens">
          <Cpu size={12} /> {formatTokens(session.tokens)} tok
        </span>
        <span title="Idle time">
          <Clock size={12} /> {formatAge(session.idle_seconds)}
        </span>
      </div>
    </button>
  );
};
