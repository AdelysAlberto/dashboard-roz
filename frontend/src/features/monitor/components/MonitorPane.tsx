import { Activity, Cpu, Filter, RefreshCw } from 'lucide-react';
import React, { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { useMonitorStore } from '../../../stores/useMonitorStore';
import { SubagentSession } from '../../../types/pilot';
import { useMonitorSessions } from '../hooks/useMonitorSessions';
import { SessionCard } from './SessionCard';
import { SessionDetail } from './SessionDetail';
import './MonitorPane.css';

export const MonitorPane: React.FC = () => {
  const { data: sessions = [], refetch, isFetching } = useMonitorSessions();
  const selectedSession = useMonitorStore((state) => state.selectedSession);
  const setSelectedSession = useMonitorStore((state) => state.setSelectedSession);
  const hideEnded = useMonitorStore((state) => state.hideEnded);
  const setHideEnded = useMonitorStore((state) => state.setHideEnded);
  const [providerFilter, setProviderFilter] = useState<'all' | 'pi' | 'opencode'>('all');

  if (selectedSession) {
    return (
      <SessionDetail
        session={selectedSession}
        onBack={() => setSelectedSession(null)}
      />
    );
  }

  const filteredSessions = sessions.filter((s) => {
    if (hideEnded && s.state === 'ended') return false;
    if (providerFilter !== 'all' && s.provider !== providerFilter) return false;
    return true;
  });

  const liveCount = sessions.filter((s) => s.state !== 'ended').length;
  const stalledCount = sessions.filter((s) => s.state === 'stalled').length;
  const piCount = sessions.filter((s) => s.provider === 'pi').length;
  const opencodeCount = sessions.filter((s) => s.provider === 'opencode').length;

  return (
    <div className="monitor-pane-container">
      {/* Monitor Toolbar */}
      <div className="monitor-toolbar">
        <div className="toolbar-left">
          <Activity size={15} className="monitor-icon" />
          <span className="toolbar-title">Agent Sessions</span>
          <span className="session-counts-badge font-mono">
            {liveCount} live · {stalledCount} stalled · ({piCount} Pi · {opencodeCount} OpenCode)
          </span>

          {/* Provider Filter Tabs */}
          <div className="provider-filter-group">
            <button
              className={`provider-filter-btn ${providerFilter === 'all' ? 'active' : ''}`}
              onClick={() => setProviderFilter('all')}
            >
              All
            </button>
            <button
              className={`provider-filter-btn ${providerFilter === 'pi' ? 'active' : ''}`}
              onClick={() => setProviderFilter('pi')}
            >
              Pi
            </button>
            <button
              className={`provider-filter-btn ${providerFilter === 'opencode' ? 'active' : ''}`}
              onClick={() => setProviderFilter('opencode')}
            >
              OpenCode
            </button>
          </div>
        </div>

        <div className="toolbar-right">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={hideEnded}
              onChange={(e) => setHideEnded(e.target.checked)}
            />
            <span>Hide ended</span>
          </label>

          <Button
            variant="ghost"
            size="xs"
            onClick={() => refetch()}
            isLoading={isFetching}
            leftIcon={<RefreshCw size={12} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Sessions Grid */}
      <div className="monitor-grid">
        {filteredSessions.length === 0 ? (
          <div className="monitor-empty">
            <p>No {hideEnded ? 'live' : 'recorded'} {providerFilter !== 'all' ? providerFilter.toUpperCase() : ''} sessions found.</p>
            <span className="monitor-empty-sub">
              Subagents launched in background (via Pi or OpenCode) will appear here in real-time.
            </span>
          </div>
        ) : (
          filteredSessions.map((session) => (
            <SessionCard
              key={session.path}
              session={session}
              onSelect={(s) => setSelectedSession(s)}
            />
          ))
        )}
      </div>
    </div>
  );
};
