import { Activity, Bot, FileText, FlaskConical, ImageIcon, LayoutGrid, Sparkles } from 'lucide-react';
import React from 'react';
import { ActionSidebar } from '../../features/actions/components/ActionSidebar';
import { AnalysisPane } from '../../features/analysis/components/AnalysisPane';
import { DocSidebar } from '../../features/documents/components/DocSidebar';
import { DocViewer } from '../../features/documents/components/DocViewer';
import { ImageTestForm } from '../../features/imageTest/components/ImageTestForm';
import { ImageTestPane } from '../../features/imageTest/components/ImageTestPane';
import { LlmTestForm } from '../../features/llmTest/components/LlmTestForm';
import { LlmTestPane } from '../../features/llmTest/components/LlmTestPane';
import { useMonitorSessions } from '../../features/monitor/hooks/useMonitorSessions';
import { MonitorPane } from '../../features/monitor/components/MonitorPane';
import { ScanPathsModal } from '../../features/paths/components/ScanPathsModal';
import { ServicesPane } from '../../features/services/components/ServicesPane';
import { SkillChatRail } from '../../features/skills/components/SkillChatRail';
import { SkillSidebar } from '../../features/skills/components/SkillSidebar';
import { SkillsPane } from '../../features/skills/components/SkillsPane';
import { ValidationModal } from '../../features/validation/components/ValidationModal';
import { useAnalysisStore } from '../../stores/useAnalysisStore';
import { useDocSelectionStore } from '../../stores/useDocSelectionStore';
import { useImageTestStore } from '../../stores/useImageTestStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
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
  const railCollapsed = useLayoutStore((state) => state.railCollapsed);
  const isImageRunning = useImageTestStore((state) => state.isRunning);

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
    {
      id: 'skills' as ActiveTab,
      label: 'Skills',
      icon: <Sparkles size={14} />,
    },
    {
      id: 'llm' as ActiveTab,
      label: 'Test IA',
      icon: <FlaskConical size={14} />,
      dot: isRunning,
      dotColor: 'var(--accent)',
    },
    {
      id: 'image' as ActiveTab,
      label: 'Test Imagen',
      icon: <ImageIcon size={14} />,
      dot: isImageRunning,
      dotColor: 'var(--accent)',
    },
    {
      id: 'services' as ActiveTab,
      label: 'Services',
      icon: <LayoutGrid size={14} />,
    },
  ];

  const isServices = activeTab === 'services';
  const isSkills = activeTab === 'skills';
  const isLlmTest = activeTab === 'llm';
  const isImageTest = activeTab === 'image';
  const isLab = isLlmTest || isImageTest;

  const gridClass = [
    'main-grid-container',
    isServices ? 'grid-services' : '',
    isSkills ? 'grid-skills' : '',
    isLab ? 'grid-lab' : '',
    railCollapsed && !isServices && !isLab ? 'rail-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const rightRail = isLlmTest ? (
    <LlmTestForm />
  ) : isImageTest ? (
    <ImageTestForm />
  ) : isSkills ? (
    <SkillChatRail />
  ) : (
    <ActionSidebar />
  );

  return (
    <div className="main-layout-root">
      <Header />

      <main className={gridClass}>
        {/* Left Column: Documents List & Filters (skill taxonomy on the Skills tab) */}
        {!isServices && !isLab && (
          <section className="column-left">
            {isSkills ? <SkillSidebar /> : <DocSidebar />}
          </section>
        )}

        {/* Center Column: Viewer / Analysis / Monitor / Lab result */}
        <section className="column-center">
          <div className="center-tabs-wrapper">
            <Tabs tabs={tabs} activeTab={activeTab} onChange={(tab) => setActiveTab(tab)} />
          </div>

          <div className="center-content-area">
            {activeTab === 'doc' && <DocViewer />}
            {activeTab === 'analysis' && <AnalysisPane />}
            {activeTab === 'monitor' && <MonitorPane />}
            {activeTab === 'skills' && <SkillsPane />}
            {activeTab === 'llm' && <LlmTestPane />}
            {activeTab === 'image' && <ImageTestPane />}
            {activeTab === 'services' && <ServicesPane />}
          </div>
        </section>

        {/* Right Column: Actions & AI Launcher (skill chat on Skills, lab form on the labs) */}
        {!isServices && <section className="column-right">{rightRail}</section>}
      </main>

      {/* Global Modals & Notifications */}
      <ScanPathsModal />
      <ValidationModal />
      <ConfirmModal />
      <ToastContainer />
    </div>
  );
};
