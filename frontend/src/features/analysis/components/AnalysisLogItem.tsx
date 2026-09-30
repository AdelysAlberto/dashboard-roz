import { BrainCircuit, ChevronDown, ChevronRight, Terminal, User, Wrench } from 'lucide-react';
import React, { useState } from 'react';
import { AnalysisLogItem as LogItemType } from '../../../types/pilot';
import { MarkdownRenderer } from '../../documents/components/MarkdownRenderer';
import { InteractiveDialog } from './InteractiveDialog';
import './AnalysisLogItem.css';

interface AnalysisLogItemProps {
  log: LogItemType;
}

export const AnalysisLogItem: React.FC<AnalysisLogItemProps> = ({ log }) => {
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);

  if (log.dialogData) {
    return <InteractiveDialog request={log.dialogData} answered={log.answered} />;
  }

  if (log.kind === 'thinking') {
    return (
      <div className="log-item log-thinking">
        <button
          className="thinking-toggle-btn"
          onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
        >
          <BrainCircuit size={13} className="thinking-icon" />
          <span>Agent Reasoning / Thoughts ({log.content.length} chars)</span>
          {isThinkingExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        {isThinkingExpanded && (
          <div className="thinking-content font-mono">{log.content}</div>
        )}
      </div>
    );
  }

  if (log.kind === 'user') {
    return (
      <div className="log-item log-user">
        <div className="log-header">
          <User size={13} />
          <span>{log.header}</span>
        </div>
        <div className="log-body">{log.content}</div>
      </div>
    );
  }

  if (log.kind === 'text') {
    return (
      <div className="log-item log-assistant">
        <div className="log-header">
          <Terminal size={13} />
          <span>{log.header}</span>
        </div>
        <div className="log-body">
          <MarkdownRenderer content={log.content} />
        </div>
      </div>
    );
  }

  if (log.kind === 'toolu') {
    return (
      <div className="log-item log-tool-call">
        <div className="log-header font-mono">
          <Wrench size={13} />
          <span>{log.header}</span>
        </div>
        <pre className="log-code font-mono">{log.content}</pre>
      </div>
    );
  }

  if (log.kind === 'toolr') {
    return (
      <div className="log-item log-tool-result">
        <div className="log-header font-mono">
          <span>{log.header}</span>
        </div>
        <pre className="log-code font-mono">{log.content}</pre>
      </div>
    );
  }

  return (
    <div className={`log-item log-${log.kind}`}>
      <div className="log-header font-mono">
        <span>{log.header}</span>
      </div>
      <div className="log-body font-mono">{log.content}</div>
    </div>
  );
};
