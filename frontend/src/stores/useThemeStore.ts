import { create } from 'zustand';
import { storage } from '../services/storage';
import { ThemeMode } from '../types/common';

interface ThemeState {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  reset: () => void;
}

const initialTheme = storage.getTheme();

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initialTheme,
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      storage.setTheme(next);
      document.documentElement.setAttribute('data-theme', next);
      return { theme: next };
    }),
  setTheme: (theme) => {
    storage.setTheme(theme);
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },
  reset: () => {
    storage.setTheme('dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    set({ theme: 'dark' });
  },
}));
