import type { ImageTestDraft } from '../types/imageTest';
import type { LlmTestDraft } from '../types/llmTest';

const KEYS = {
  THEME: 'roz-theme',
  PATHS_HISTORY: 'roz-paths-history',
  FAVORITES: 'roz-favorites',
  PROMPT_CUSTOM: 'roz-custom-prompt',
  LLM_TEST_DRAFT: 'roz-llm-test-draft',
  IMAGE_TEST_DRAFT: 'roz-image-test-draft',
  RAIL_COLLAPSED: 'roz-rail-collapsed',
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

  /** The prompt-lab draft survives reloads. The API key never does: it stays in
   * memory or in ROZ_LLM_TEST_KEY, never in localStorage. */
  getLlmTestDraft: (): LlmTestDraft | null => {
    try {
      const raw = localStorage.getItem(KEYS.LLM_TEST_DRAFT);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const draft = parsed as Partial<LlmTestDraft>;
      if (typeof draft.master_prompt !== 'string' || typeof draft.user_prompt !== 'string') {
        return null;
      }
      return { ...(draft as LlmTestDraft), api_key: '' };
    } catch {
      return null;
    }
  },

  saveLlmTestDraft: (draft: LlmTestDraft) => {
    try {
      const { api_key: _apiKey, ...persisted } = draft;
      localStorage.setItem(KEYS.LLM_TEST_DRAFT, JSON.stringify(persisted));
    } catch {
      // ignore
    }
  },

  /** Image-lab draft, same rule as the prompt lab: everything persists except
   * the API key. */
  getImageTestDraft: (): Partial<ImageTestDraft> | null => {
    try {
      const raw = localStorage.getItem(KEYS.IMAGE_TEST_DRAFT);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return { ...(parsed as Partial<ImageTestDraft>), api_key: '' };
    } catch {
      return null;
    }
  },

  saveImageTestDraft: (draft: ImageTestDraft) => {
    try {
      const { api_key: _apiKey, ...persisted } = draft;
      localStorage.setItem(KEYS.IMAGE_TEST_DRAFT, JSON.stringify(persisted));
    } catch {
      // ignore
    }
  },

  getRailCollapsed: (): boolean => {    try {
      return localStorage.getItem(KEYS.RAIL_COLLAPSED) === '1';
    } catch {
      return false;
    }
  },

  setRailCollapsed: (collapsed: boolean) => {
    try {
      localStorage.setItem(KEYS.RAIL_COLLAPSED, collapsed ? '1' : '0');
    } catch {
      // ignore
    }
  },
};
