import { ArrowLeft, Zap } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { api } from '../../../services/api';
import { useModalStore } from '../../../stores/useModalStore';
import { useToastStore } from '../../../stores/useToastStore';
import { SubagentSession } from '../../../types/pilot';
import { useSessionLog } from '../hooks/useSessionLog';
import './SessionDetail.css';

interface SessionDetailProps {
  session: SubagentSession;
  onBack: () => void;
}

export const SessionDetail: React.FC<SessionDetailProps> = ({ session, onBack }) => {
  const { data: events = [], isLoading } = useSessionLog(session.path);
  const openConfirm = useModalStore((state) => state.openConfirm);
  const toast = useToastStore();
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  const handleAbort = () => {
    openConfirm({
      title: 'Abort Subagent Process',
      message: `Send SIGTERM signal to @${session.agent} (PID: ${session.pid})?\n\nSubagents run with closed stdin. Aborting is the recovery mechanism so the parent dispatcher sees the failure and can re-launch.`,
      confirmLabel: 'Send SIGTERM',
      isDanger: true,
      onConfirm: async () => {
        try {
          const res = await api.killSession(session.path);
          toast.success(`Abort signal sent to pid ${res.pid}`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to send abort signal');
        }
      },
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
          {session.pid && <span className="detail-pid font-mono">PID {session.pid}</span>}
          {session.task_tag && <Badge variant="purple" size="xs">{session.task_tag}</Badge>}
          <Badge variant={session.state === 'active' ? 'done' : session.state === 'stalled' ? 'rejected' : 'pending'} size="xs">
            {session.state}
          </Badge>
        </div>

        {session.kind !== 'primary' && session.pid && (
          <Button
            variant="danger"
            size="sm"
            onClick={handleAbort}
            leftIcon={<Zap size={14} />}
            title="Subagents run with stdin closed; the only nudge available is SIGTERM (abort)"
          >
            Abort Process
          </Button>
        )}
      </div>

      {/* Task description */}
      <div className="detail-task-card">
        <div className="detail-task-label">Assigned Task</div>
        <p className="detail-task-text">{session.task}</p>
      </div>

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
