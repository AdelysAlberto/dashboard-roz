import { CornerDownLeft, X } from 'lucide-react';
import React, { KeyboardEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useAnalysisStore } from '../../../stores/useAnalysisStore';
import { useAnalysisActions } from '../hooks/useAnalysisActions';
import './ChatInputRow.css';

export const ChatInputRow: React.FC = () => {
  const activeRunId = useAnalysisStore((state) => state.activeRunId);
  const isRunning = useAnalysisStore((state) => state.isRunning);
  const isIdle = useAnalysisStore((state) => state.isIdle);
  const followUpInput = useAnalysisStore((state) => state.followUpInput);
  const setFollowUpInput = useAnalysisStore((state) => state.setFollowUpInput);

  const { sendFollowup, closeAnalysisSession } = useAnalysisActions();

  if (!activeRunId || !isRunning) return null;

  const handleSend = () => {
    if (activeRunId) {
      sendFollowup(activeRunId, followUpInput);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      handleSend();
    }
  };

  const placeholder = isIdle
    ? 'Session is waiting for your reply (press Enter to send)…'
    : 'Send a message or follow-up prompt to the running agent…';

  return (
    <div className="chat-input-row">
      <Input
        value={followUpInput}
        onChange={(e) => setFollowUpInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="chat-input-control"
        rightElement={
          <Button
            variant="ghost"
            size="xs"
            onClick={handleSend}
            disabled={!followUpInput.trim()}
            aria-label="Send follow-up"
          >
            <CornerDownLeft size={14} />
          </Button>
        }
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => closeAnalysisSession(activeRunId)}
        leftIcon={<X size={14} />}
        title="Close this interactive RPC session"
      >
        Close Session
      </Button>
    </div>
  );
};
