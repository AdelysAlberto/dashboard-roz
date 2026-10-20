import { create } from 'zustand';
import { SkillCategory } from '../types/skill';

interface SkillsState {
  query: string;
  category: SkillCategory | 'all';
  source: string | 'all';
  selectedId: string | null;
  setQuery: (query: string) => void;
  setCategory: (category: SkillCategory | 'all') => void;
  setSource: (source: string | 'all') => void;
  select: (id: string | null) => void;
  resetFilters: () => void;
}

export const useSkillsStore = create<SkillsState>((set) => ({
  query: '',
  category: 'all',
  source: 'all',
  selectedId: null,
  setQuery: (query) => set({ query }),
  setCategory: (category) => set({ category }),
  setSource: (source) => set({ source }),
  select: (selectedId) => set({ selectedId }),
  resetFilters: () => set({ query: '', category: 'all', source: 'all' }),
}));
