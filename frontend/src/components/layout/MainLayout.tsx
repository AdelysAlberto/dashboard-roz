import { Activity, Bot, FileText } from 'lucide-react';
import React from 'react';
import { ActionSidebar } from '../../features/actions/components/ActionSidebar';
import { AnalysisPane } from '../../features/analysis/components/AnalysisPane';
import { DocSidebar } from '../../features/documents/components/DocSidebar';
import { DocViewer } from '../../features/documents/components/DocViewer';
import { useMonitorSessions } from '../../features/monitor/hooks/useMonitorSessions';
import { MonitorPane } from '../../features/monitor/components/MonitorPane';
import { ScanPathsModal } from '../../features/paths/components/ScanPathsModal';
import { ValidationModal } from '../../features/validation/components/ValidationModal';
import { useAnalysisStore } from '../../stores/useAnalysisStore';
import { useDocSelectionStore } from '../../stores/useDocSelectionStore';
import { ActiveTab } from '../../types/common';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Tabs } from '../ui/Tabs';
import { ToastContainer } from '../ui/ToastContainer';
import { Header } from './Header';
import './MainLayout.css';

export const MainLayout: React.FC = () => {
  const activeTab = useDocSelectionStore((state) => state.activeTab);
  const setActiveTab = useDocSelectionStore((state) => state.setActiveTab);
  const hasUnseenEvent = useAnalysisStore((state) => state.hasUnseenEvent);
  const isRunning = useAnalysisStore((state) => state.isRunning);

  const { data: sessions = [] } = useMonitorSessions();
  const liveMonitorSessions = sessions.filter((s) => s.state !== 'ended').length;

  const tabs = [
    {
      id: 'doc' as ActiveTab,
      label: 'Document',
      icon: <FileText size={14} />,
    },
    {
      id: 'analysis' as ActiveTab,
      label: 'Analysis',
      icon: <Bot size={14} />,
      dot: isRunning || hasUnseenEvent,
      dotColor: isRunning ? 'var(--accent)' : 'var(--color-pending)',
    },
    {
      id: 'monitor' as ActiveTab,
      label: 'Subagent Monitor',
      icon: <Activity size={14} />,
      dot: liveMonitorSessions > 0,
      dotColor: 'var(--color-done)',
    },
  ];

  return (
    <div className="main-layout-root">
      <Header />

      <main className="main-grid-container">
        {/* Left Column: Documents List & Filters */}
        <section className="column-left">
          <DocSidebar />
        </section>

        {/* Center Column: Viewer / Analysis / Monitor */}
        <section className="column-center">
          <div className="center-tabs-wrapper">
            <Tabs
              tabs={tabs}
              activeTab={activeTab}
              onChange={(tab) => setActiveTab(tab)}
            />
          </div>

          <div className="center-content-area">
            {activeTab === 'doc' && <DocViewer />}
            {activeTab === 'analysis' && <AnalysisPane />}
            {activeTab === 'monitor' && <MonitorPane />}
          </div>
        </section>

        {/* Right Column: Actions & AI Launcher */}
        <section className="column-right">
          <ActionSidebar />
        </section>
      </main>

      {/* Global Modals & Notifications */}
      <ScanPathsModal />
      <ValidationModal />
      <ConfirmModal />
      <ToastContainer />
    </div>
  );
};
