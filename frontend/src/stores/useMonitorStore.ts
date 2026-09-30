import { create } from 'zustand';
import { SubagentSession } from '../types/pilot';

interface MonitorState {
  selectedSession: SubagentSession | null;
  hideEnded: boolean;
  setSelectedSession: (session: SubagentSession | null) => void;
  setHideEnded: (hide: boolean) => void;
  reset: () => void;
}

export const useMonitorStore = create<MonitorState>((set) => ({
  selectedSession: null,
  hideEnded: true,
  setSelectedSession: (selectedSession) => set({ selectedSession }),
  setHideEnded: (hideEnded) => set({ hideEnded }),
  reset: () => set({ selectedSession: null, hideEnded: true }),
}));
