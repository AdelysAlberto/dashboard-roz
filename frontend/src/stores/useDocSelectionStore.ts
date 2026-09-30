import { create } from 'zustand';
import { ActiveTab } from '../types/common';
import { DocItem } from '../types/document';

interface DocSelectionState {
  selectedDoc: DocItem | null;
  activeTab: ActiveTab;
  selectDoc: (doc: DocItem | null) => void;
  setActiveTab: (tab: ActiveTab) => void;
  updateSelectedMeta: (meta: Partial<DocItem>) => void;
  reset: () => void;
}

const initialState = {
  selectedDoc: null,
  activeTab: 'doc' as ActiveTab,
};

export const useDocSelectionStore = create<DocSelectionState>((set) => ({
  ...initialState,
  selectDoc: (doc) => set({ selectedDoc: doc, activeTab: 'doc' }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  updateSelectedMeta: (meta) =>
    set((state) => ({
      selectedDoc: state.selectedDoc ? { ...state.selectedDoc, ...meta } : null,
    })),
  reset: () => set(initialState),
}));
