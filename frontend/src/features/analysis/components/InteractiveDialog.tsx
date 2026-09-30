import { Check, HelpCircle, Send, X } from 'lucide-react';
import React, { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { useAnalysisStore } from '../../../stores/useAnalysisStore';
import { ExtensionUiRequest } from '../../../types/pilot';
import { useAnalysisActions } from '../hooks/useAnalysisActions';
import './InteractiveDialog.css';

interface InteractiveDialogProps {
  request: ExtensionUiRequest;
  answered?: string;
}

export const InteractiveDialog: React.FC<InteractiveDialogProps> = ({ request, answered }) => {
  const activeRunId = useAnalysisStore((state) => state.activeRunId);
  const { answerUiDialog } = useAnalysisActions();
  const [inputValue, setInputValue] = useState('');

  if (answered) {
    return (
      <div className="dialog-answered-card">
        <Check size={14} className="dialog-answered-icon" />
        <span>Answered: <strong>{answered}</strong></span>
      </div>
    );
  }

  if (!activeRunId) return null;

  const handleConfirm = (confirmed: boolean) => {
    answerUiDialog(
      activeRunId,
      request.id,
      { confirmed },
      confirmed ? 'Yes' : 'No'
    );
  };

  const handleSelect = (option: string) => {
    answerUiDialog(
      activeRunId,
      request.id,
      { value: option },
      option
    );
  };

  const handleCustomSubmit = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    answerUiDialog(
      activeRunId,
      request.id,
      { value: trimmed },
      trimmed.slice(0, 80)
    );
  };

  const handleCancel = () => {
    answerUiDialog(
      activeRunId,
      request.id,
      { cancelled: true },
      '(Cancelled)'
    );
  };

  return (
    <div className="interactive-dialog-card">
      <div className="dialog-header">
        <HelpCircle size={15} className="dialog-icon" />
        <span className="dialog-title">{request.title || 'The agent requires your input'}</span>
      </div>

      {request.message && <p className="dialog-message">{request.message}</p>}

      <div className="dialog-actions">
        {request.method === 'confirm' && (
          <div className="dialog-buttons-row">
            <Button
              variant="success"
              size="sm"
              leftIcon={<Check size={14} />}
              onClick={() => handleConfirm(true)}
            >
              Yes
            </Button>
            <Button
              variant="danger"
              size="sm"
              leftIcon={<X size={14} />}
              onClick={() => handleConfirm(false)}
            >
              No
            </Button>
          </div>
        )}

        {request.method === 'select' && (
          <div className="dialog-options-grid">
            {request.options?.map((opt) => (
              <Button
                key={opt}
                variant="secondary"
                size="sm"
                onClick={() => handleSelect(opt)}
                className="dialog-option-btn"
              >
                {opt}
              </Button>
            ))}
          </div>
        )}

        {(request.method === 'input' || request.method === 'editor') && (
          <div className="dialog-input-group">
            {request.method === 'editor' ? (
              <Textarea
                rows={4}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Enter your response…"
              />
            ) : (
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Enter your response…"
                onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
              />
            )}
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Send size={13} />}
              onClick={handleCustomSubmit}
            >
              Submit Answer
            </Button>
          </div>
        )}

        <Button
          variant="ghost"
          size="xs"
          onClick={handleCancel}
          className="dialog-cancel-btn"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
};
