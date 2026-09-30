import { create } from 'zustand';
import { GroupOption, SortOption } from '../types/common';
import { StatusType } from '../types/document';

interface FilterState {
  search: string;
  statusFilter: StatusType | 'all';
  rootFilter: string | 'all';
  sortBy: SortOption;
  groupBy: GroupOption;
  setSearch: (search: string) => void;
  setStatusFilter: (status: StatusType | 'all') => void;
  setRootFilter: (root: string | 'all') => void;
  setSortBy: (sortBy: SortOption) => void;
  setGroupBy: (groupBy: GroupOption) => void;
  resetFilters: () => void;
}

const initialState = {
  search: '',
  statusFilter: 'all' as const,
  rootFilter: 'all' as const,
  sortBy: 'title-asc' as SortOption,
  groupBy: 'root' as GroupOption,
};

export const useFilterStore = create<FilterState>((set) => ({
  ...initialState,
  setSearch: (search) => set({ search }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setRootFilter: (rootFilter) => set({ rootFilter }),
  setSortBy: (sortBy) => set({ sortBy }),
  setGroupBy: (groupBy) => set({ groupBy }),
  resetFilters: () => set(initialState),
}));
