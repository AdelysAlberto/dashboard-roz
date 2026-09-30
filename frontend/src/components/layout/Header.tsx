import { CheckSquare, FolderGit2, Moon, RefreshCw, Sun, Terminal } from 'lucide-react';
import React from 'react';
import { useConfig } from '../../features/actions/hooks/useConfig';
import { useDocuments } from '../../features/documents/hooks/useDocuments';
import { useModalStore } from '../../stores/useModalStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { useToastStore } from '../../stores/useToastStore';
import { Button } from '../ui/Button';
import './Header.css';

export const Header: React.FC = () => {
  const { theme, toggleTheme } = useThemeStore();
  const openModal = useModalStore((state) => state.openModal);
  const { data: config } = useConfig();
  const { data: docs = [], refetch: refetchDocs, isFetching: isFetchingDocs } = useDocuments();
  const toast = useToastStore();

  const handleRescan = async () => {
    await refetchDocs();
    toast.success('Rescanned all document roots');
  };

  return (
    <header className="app-header">
      {/* Brand */}
      <div className="header-brand">
        <div className="brand-title">
          <span className="prompt-glyph">❯</span>
          <span className="brand-name">roz</span>
          <span className="cursor-blink">_</span>
        </div>
        <span className="brand-subtitle font-mono">v2.0 · md tracker</span>
      </div>

      {/* Center Stats */}
      <div className="header-stats font-mono">
        <span className="stat-pill">
          <strong>{docs.length}</strong> docs
        </span>
        {config?.model && (
          <span className="stat-pill stat-model" title={`Pi Binary: ${config.pi_bin}`}>
            <Terminal size={12} />
            <span>model: {config.model}</span>
          </span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="header-actions">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          aria-label="Toggle dark/light theme"
          leftIcon={theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleRescan}
          disabled={isFetchingDocs}
          isLoading={isFetchingDocs}
          leftIcon={<RefreshCw size={14} />}
          title="Rescan all registered paths"
        >
          Rescan
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => openModal('validate')}
          leftIcon={<CheckSquare size={14} />}
          title="Audit frontmatter metadata conventions"
        >
          Validate
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => openModal('paths')}
          leftIcon={<FolderGit2 size={14} />}
          title="Manage scan paths"
        >
          Paths
        </Button>
      </div>
    </header>
  );
};
