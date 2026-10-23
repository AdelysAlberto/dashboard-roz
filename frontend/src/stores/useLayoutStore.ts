import { create } from 'zustand';
import { storage } from '../services/storage';

interface LayoutState {
  /** Left rail (document list / skill taxonomy) hidden. Persisted: an iPad
   * session should not have to re-collapse it on every reload. */
  railCollapsed: boolean;
  toggleRail: () => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  railCollapsed: storage.getRailCollapsed(),
  toggleRail: () =>
    set((state) => {
      const railCollapsed = !state.railCollapsed;
      storage.setRailCollapsed(railCollapsed);
      return { railCollapsed };
    }),
}));
