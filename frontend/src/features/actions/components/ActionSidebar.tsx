import { ArrowRight, Bot, FileCode, FolderInput, Play, RefreshCw, Trash2, Zap } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { useAnalysisStore } from '../../../stores/useAnalysisStore';
import { useDocSelectionStore } from '../../../stores/useDocSelectionStore';
import { useModalStore } from '../../../stores/useModalStore';
import { useToastStore } from '../../../stores/useToastStore';
import { useAnalysisActions } from '../../analysis/hooks/useAnalysisActions';
import { useConfig } from '../hooks/useConfig';
import { useDocActions } from '../hooks/useDocActions';
import './ActionSidebar.css';

export const ActionSidebar: React.FC = () => {
  const selectedDoc = useDocSelectionStore((state) => state.selectedDoc);
  const { data: config } = useConfig();
  const { statusMutation, moveMutation, deleteMutation } = useDocActions();
  const { startAnalysis } = useAnalysisActions();
  const openConfirm = useModalStore((state) => state.openConfirm);
  const toast = useToastStore();

  const isRunning = useAnalysisStore((state) => state.isRunning);
  const prompt = useAnalysisStore((state) => state.prompt);
  const setPrompt = useAnalysisStore((state) => state.setPrompt);
  const selectedAgent = useAnalysisStore((state) => state.selectedAgent);
  const setSelectedAgent = useAnalysisStore((state) => state.setSelectedAgent);

  const [destDir, setDestDir] = useState('');

  useEffect(() => {
    if (selectedDoc) {
      setDestDir(config?.done_dir || selectedDoc.parent || '');
    }
  }, [selectedDoc, config]);

  if (!selectedDoc) {
    return (
      <aside className="action-sidebar action-sidebar-empty">
        <div className="action-empty-note">
          <FileCode size={28} className="empty-icon" />
          <p>Select a document from the list to update status, move, delete, or run AI analysis.</p>
        </div>
      </aside>
    );
  }

  const handleStatusChange = (status: string) => {
    statusMutation.mutate({ path: selectedDoc.path, status });
  };

  const handleMove = () => {
    const trimmed = destDir.trim();
    if (!trimmed) {
      toast.warning('Please specify a destination folder first');
      return;
    }

    openConfirm({
      title: 'Move Document',
      message: `Move "${selectedDoc.title || selectedDoc.name}"\n\nFrom:\n${selectedDoc.parent}\n\nTo:\n${trimmed}`,
      confirmLabel: 'Move File',
      onConfirm: () => moveMutation.mutateAsync({ path: selectedDoc.path, dest: trimmed }),
    });
  };

  const handleDelete = () => {
    openConfirm({
      title: 'Delete Document',
      message: `Are you sure you want to delete this document?\n\n"${selectedDoc.title || selectedDoc.name}"\n(${selectedDoc.path})\n\nThis action cannot be undone.`,
      confirmLabel: 'Delete File',
      isDanger: true,
      onConfirm: () => deleteMutation.mutateAsync(selectedDoc.path),
    });
  };

  const handleAnalyze = () => {
    startAnalysis(selectedDoc.path, prompt, selectedAgent);
  };

  return (
    <aside className="action-sidebar">
      {/* 1. Status Section */}
      <section className="action-section">
        <div className="section-title">Status Management</div>
        <div className="status-grid">
          <Button
            variant="status-pending"
            size="sm"
            onClick={() => handleStatusChange('pending')}
            disabled={statusMutation.isPending}
            leftIcon={<RefreshCw size={12} />}
          >
            Pending
          </Button>
          <Button
            variant="status-in-progress"
            size="sm"
            onClick={() => handleStatusChange('in progress')}
            disabled={statusMutation.isPending}
            leftIcon={<Play size={12} />}
          >
            In Progress
          </Button>
          <Button
            variant="status-done"
            size="sm"
            onClick={() => handleStatusChange('done')}
            disabled={statusMutation.isPending}
            leftIcon={<span style={{ fontSize: '12px' }}>✓</span>}
          >
            Done
          </Button>
          <Button
            variant="status-blocked"
            size="sm"
            onClick={() => handleStatusChange('blocked')}
            disabled={statusMutation.isPending}
            leftIcon={<span style={{ fontSize: '12px' }}>⛔</span>}
          >
            Blocked
          </Button>
          <Button
            variant="status-rejected"
            size="sm"
            onClick={() => handleStatusChange('rejected')}
            disabled={statusMutation.isPending}
            leftIcon={<span style={{ fontSize: '12px' }}>✗</span>}
          >
            Rejected
          </Button>
          <Button
            variant="status-deprecated"
            size="sm"
            onClick={() => handleStatusChange('deprecated')}
            disabled={statusMutation.isPending}
            leftIcon={<span style={{ fontSize: '12px' }}>⊘</span>}
          >
            Deprecated
          </Button>
        </div>
        <div className="status-current-badge">
          <span>Current:</span>
          {selectedDoc.status ? (
            <Badge variant={selectedDoc.status} size="sm" dot>
              {selectedDoc.status}
            </Badge>
          ) : (
            <span className="no-status-label">No status declared</span>
          )}
        </div>
      </section>

      {/* 2. File Operations */}
      <section className="action-section">
        <div className="section-title">File Location</div>
        <Input
          label="Source Path"
          value={selectedDoc.path}
          readOnly
          className="readonly-path"
        />

        <Input
          label="Move To Directory"
          value={destDir}
          onChange={(e) => setDestDir(e.target.value)}
          placeholder="/path/to/destination"
        />

        <div className="file-btn-group">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleMove}
            disabled={moveMutation.isPending}
            leftIcon={<FolderInput size={14} />}
            isLoading={moveMutation.isPending}
          >
            Move File
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            leftIcon={<Trash2 size={14} />}
            isLoading={deleteMutation.isPending}
          >
            Delete
          </Button>
        </div>
      </section>

      {/* 3. AI Analysis */}
      <section className="action-section action-section-ai">
        <div className="section-title ai-title">
          <Bot size={14} />
          <span>AI Assisted Analysis</span>
        </div>

        <Select
          label="Agent"
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
        >
          <option value="none">(Default Pi Agent)</option>
          {config?.agents?.map((a) =>
            a !== 'none' ? (
              <option key={a} value={a}>
                @{a}
              </option>
            ) : null
          )}
        </Select>

        <Textarea
          label="Prompt"
          hint="{file} {content} placeholders"
          rows={6}
          mono
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />

        <Button
          variant="primary"
          size="md"
          onClick={handleAnalyze}
          disabled={isRunning}
          isLoading={isRunning}
          leftIcon={<Zap size={15} />}
          className="btn-run-analysis"
        >
          {isRunning ? 'Analyzing with Pi…' : 'Analyze with Pi'}
        </Button>
      </section>
    </aside>
  );
};
