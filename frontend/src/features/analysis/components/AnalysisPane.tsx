import { Bot, Terminal, Trash2, Zap } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { Button } from '../../../components/ui/Button';
import { useAnalysisStore } from '../../../stores/useAnalysisStore';
import { useAnalysisWebSocket } from '../hooks/useAnalysisWebSocket';
import { AnalysisLogItem } from './AnalysisLogItem';
import { ChatInputRow } from './ChatInputRow';
import './AnalysisPane.css';

export const AnalysisPane: React.FC = () => {
  useAnalysisWebSocket();

  const logs = useAnalysisStore((state) => state.logs);
  const isRunning = useAnalysisStore((state) => state.isRunning);
  const isIdle = useAnalysisStore((state) => state.isIdle);
  const activeRunId = useAnalysisStore((state) => state.activeRunId);
  const clearLogs = useAnalysisStore((state) => state.clearLogs);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="analysis-pane-container">
      {/* Top status bar */}
      <div className="analysis-header-bar">
        <div className="analysis-header-left">
          <Terminal size={15} className="analysis-icon" />
          <span className="analysis-title">Interactive Analysis Stream</span>
          {isRunning && (
            <span className={`analysis-status-pill ${isIdle ? 'status-idle' : 'status-live'}`}>
              <span className="pulse-dot" />
              {isIdle ? 'Waiting for user' : 'Agent executing'}
            </span>
          )}
          {activeRunId && <span className="run-id-tag font-mono">{activeRunId}</span>}
        </div>

        {logs.length > 0 && !isRunning && (
          <Button
            variant="ghost"
            size="xs"
            onClick={clearLogs}
            leftIcon={<Trash2 size={13} />}
          >
            Clear Log
          </Button>
        )}
      </div>

      {/* Main log list */}
      <div className="analysis-log-list" ref={scrollRef}>
        {logs.length === 0 ? (
          <div className="analysis-empty">
            <Bot size={36} className="empty-bot-icon" />
            <p className="empty-title">No active analysis session</p>
            <p className="empty-subtitle">
              Select a document and click <strong>⚡ Analyze with Pi</strong> in the right sidebar to start an interactive review.
            </p>
          </div>
        ) : (
          logs.map((log) => <AnalysisLogItem key={log.id} log={log} />)
        )}
      </div>

      {/* Follow-up chat input */}
      <ChatInputRow />
    </div>
  );
};
