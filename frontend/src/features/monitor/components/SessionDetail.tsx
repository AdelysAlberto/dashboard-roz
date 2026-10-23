import { ArrowLeft, Scissors, Square, UserX } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { useModalStore } from '../../../stores/useModalStore';
import { SubagentSession } from '../../../types/pilot';
import { useLatigazo } from '../hooks/useLatigazo';
import { useSessionLog } from '../hooks/useSessionLog';
import './SessionDetail.css';

interface SessionDetailProps {
  session: SubagentSession;
  onBack: () => void;
}

export const SessionDetail: React.FC<SessionDetailProps> = ({ session, onBack }) => {
  const { data: events = [], isLoading } = useSessionLog(session.path);
  const openConfirm = useModalStore((state) => state.openConfirm);
  const logRef = useRef<HTMLDivElement>(null);
  const { cut, pendingLevel } = useLatigazo(session.path);
  const levels = session.interrupt_levels ?? ['tool', 'kill'];

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  const handleAbort = () => {
    openConfirm({
      title: 'Terminate session process',
      message: `Send SIGTERM to @${session.agent} (PID: ${session.pid})?\n\nThe turn is lost; the transcript survives in the session file and can be resumed with --continue. To keep the turn, use "Cut tool" instead.`,
      confirmLabel: 'Terminate',
      isDanger: true,
      onConfirm: () => cut('kill'),
    });
  };

  const handleCutTurn = () => {
    openConfirm({
      title: 'Abort the turn',
      message: `Abort the current turn of @${session.agent}?\n\nThe session stays alive and resumable, but the work in progress is dropped.`,
      confirmLabel: 'Abort turn',
      isDanger: false,
      onConfirm: () => cut('turn'),
    });
  };

  return (
    <div className="session-detail-container">
      {/* Top Header */}
      <div className="detail-top-bar">
        <Button variant="ghost" size="sm" onClick={onBack} leftIcon={<ArrowLeft size={14} />}>
          Back to sessions
        </Button>
        <div className="detail-title-group">
          <span className="detail-agent-name">
            {session.kind === 'primary' ? `◉ ${session.project || 'Session'}` : `@${session.agent}`}
          </span>
          <Badge variant={session.provider === 'opencode' ? 'opencode' : 'pi'} size="xs">
            {session.provider === 'opencode' ? 'OpenCode' : 'Pi'}
          </Badge>
          {session.model && (
            <Badge variant="info" size="xs" className="font-mono" title={session.model_provider || undefined}>
              {session.model}
            </Badge>
          )}
          {session.pid && <span className="detail-pid font-mono">PID {session.pid}</span>}
          {session.task_tag && <Badge variant="purple" size="xs">{session.task_tag}</Badge>}
          <Badge variant={session.state === 'active' ? 'done' : session.state === 'stalled' ? 'rejected' : 'pending'} size="xs">
            {session.state}
          </Badge>
        </div>

        {session.state !== 'ended' && (
          <div className="detail-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => cut('tool')}
              isLoading={pendingLevel === 'tool'}
              leftIcon={<Scissors size={14} />}
              title="Kill the process of the tool call in flight. The agent receives exit 143 and resumes the turn with its context intact."
            >
              Cut tool
            </Button>
            {levels.includes('turn') && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCutTurn}
                isLoading={pendingLevel === 'turn'}
                leftIcon={<Square size={14} />}
                title="Abort the agent turn. The session survives and can be resumed."
              >
                Abort turn
              </Button>
            )}
            <Button
              variant="danger"
              size="sm"
              onClick={handleAbort}
              isLoading={pendingLevel === 'kill'}
              leftIcon={<UserX size={14} />}
              title="SIGTERM the agent process. Last resort: the turn is lost."
            >
              Terminate
            </Button>
          </div>
        )}
      </div>

      {/* Task description */}
      <div className="detail-task-card">
        <div className="detail-task-label">Assigned Task</div>
        <p className="detail-task-text">{session.task}</p>
      </div>

      {session.latigazo && (
        <div className={`detail-latigazo ${session.latigazo.ok ? '' : 'is-failed'}`}>
          <Scissors size={13} />
          <span>
            Watchdog cut <code>{session.latigazo.level}</code> at {session.latigazo.ts.slice(11)} —{' '}
            {session.latigazo.reason}. {session.latigazo.detail}
          </span>
        </div>
      )}

      {/* Log Feed */}
      <div className="detail-log-list" ref={logRef}>
        {isLoading && events.length === 0 ? (
          <div className="detail-loading">
            <div className="btn-spinner" />
            <span>Reading session transcript log…</span>
          </div>
        ) : events.length === 0 ? (
          <div className="detail-empty">No activity events recorded yet.</div>
        ) : (
          events.map((ev, i) => {
            const head = ev.kind === 'tool' ? `→ ${ev.tool || 'tool'}` : ev.kind === 'result' ? `← ${ev.tool || 'result'}` : ev.kind;
            return (
              <div key={i} className={`detail-log-item ev-kind-${ev.kind}`}>
                <div className="ev-meta font-mono">
                  <span className="ev-time">{ev.ts}</span>
                  <span className="ev-head">{head}</span>
                </div>
                <pre className="ev-text font-mono">{ev.text}</pre>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
