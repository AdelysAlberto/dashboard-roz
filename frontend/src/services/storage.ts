const KEYS = {
  THEME: 'roz-theme',
  PATHS_HISTORY: 'roz-paths-history',
  FAVORITES: 'roz-favorites',
  PROMPT_CUSTOM: 'roz-custom-prompt',
} as const;

export const storage = {
  getTheme: (): 'dark' | 'light' => {
    try {
      const stored = localStorage.getItem(KEYS.THEME);
      return stored === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  },

  setTheme: (theme: 'dark' | 'light') => {
    try {
      localStorage.setItem(KEYS.THEME, theme);
    } catch {
      // ignore
    }
  },

  getRecentPaths: (): string[] => {
    try {
      const raw = localStorage.getItem(KEYS.PATHS_HISTORY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  saveRecentPath: (path: string) => {
    try {
      const current = storage.getRecentPaths();
      const next = [path, ...current.filter((p) => p !== path)].slice(0, 15);
      localStorage.setItem(KEYS.PATHS_HISTORY, JSON.stringify(next));
    } catch {
      // ignore
    }
  },

  removeRecentPath: (path: string) => {
    try {
      const current = storage.getRecentPaths();
      const next = current.filter((p) => p !== path);
      localStorage.setItem(KEYS.PATHS_HISTORY, JSON.stringify(next));
    } catch {
      // ignore
    }
  },

  getCustomPrompt: (): string | null => {
    try {
      return localStorage.getItem(KEYS.PROMPT_CUSTOM);
    } catch {
      return null;
    }
  },

  setCustomPrompt: (prompt: string) => {
    try {
      localStorage.setItem(KEYS.PROMPT_CUSTOM, prompt);
    } catch {
      // ignore
    }
  },
};
