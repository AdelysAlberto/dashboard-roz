import { CheckSquare, FolderGit2, Moon, PanelLeftClose, PanelLeftOpen, RefreshCw, Sun, Terminal } from 'lucide-react';
import React from 'react';
import { useConfig } from '../../features/actions/hooks/useConfig';
import { useDocuments } from '../../features/documents/hooks/useDocuments';
import { useDocSelectionStore } from '../../stores/useDocSelectionStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { useModalStore } from '../../stores/useModalStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { useToastStore } from '../../stores/useToastStore';
import { ActiveTab } from '../../types/common';
import { Button } from '../ui/Button';
import './Header.css';

/** Tabs that render a left rail; the toggle is meaningless on the others. */
const RAIL_TABS: ActiveTab[] = ['doc', 'analysis', 'monitor', 'skills'];

export const Header: React.FC = () => {
  const { theme, toggleTheme } = useThemeStore();
  const openModal = useModalStore((state) => state.openModal);
  const { data: config } = useConfig();
  const { data: docs = [], refetch: refetchDocs, isFetching: isFetchingDocs } = useDocuments();
  const activeTab = useDocSelectionStore((state) => state.activeTab);
  const railCollapsed = useLayoutStore((state) => state.railCollapsed);
  const toggleRail = useLayoutStore((state) => state.toggleRail);
  const toast = useToastStore();
  const hasRail = RAIL_TABS.includes(activeTab);

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
        {hasRail && (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleRail}
            aria-pressed={railCollapsed}
            title={railCollapsed ? 'Show the document rail' : 'Hide the document rail'}
            className="rail-toggle"
            leftIcon={railCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          >
            Rail
          </Button>
        )}
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
