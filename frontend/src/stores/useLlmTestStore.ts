import { create } from 'zustand';
import { storage } from '../services/storage';
import { LlmTestContext, LlmTestDraft, LlmTestRun } from '../types/llmTest';

export const EMPTY_DRAFT: LlmTestDraft = {
  api_url: '',
  api_key: '',
  model: '',
  temperature: 0.2,
  max_tokens: '',
  thinking: 'default',
  reasoning_effort: '',
  thinking_budget: '',
  master_prompt: '',
  user_prompt: '',
  context: {
    latitude: '',
    longitude: '',
    vehicle: 'moto',
    avoid_highways: false,
    avoid_tolls: false,
    prefer_curves: false,
  },
};

interface LlmTestState {
  draft: LlmTestDraft;
  run: LlmTestRun | null;
  error: string | null;
  isRunning: boolean;
  startedAt: number | null;
  patch: (partial: Partial<Omit<LlmTestDraft, 'context'>>) => void;
  patchContext: (partial: Partial<LlmTestContext>) => void;
  beginRun: () => void;
  finishRun: () => void;
  setRun: (run: LlmTestRun) => void;
  setError: (error: string | null) => void;
}

const initialDraft = storage.getLlmTestDraft() ?? EMPTY_DRAFT;

// EMPTY_DRAFT first: a draft saved by an older build is missing the fields added
// since (thinking, effort, budget), and the tab assumes the full shape.
export const useLlmTestStore = create<LlmTestState>((set) => ({
  draft: {
    ...EMPTY_DRAFT,
    ...initialDraft,
    context: { ...EMPTY_DRAFT.context, ...initialDraft.context },
  },
  run: null,
  error: null,
  isRunning: false,
  startedAt: null,
  patch: (partial) =>
    set((state) => {
      const draft = { ...state.draft, ...partial };
      storage.saveLlmTestDraft(draft);
      return { draft };
    }),
  patchContext: (partial) =>
    set((state) => {
      const draft = { ...state.draft, context: { ...state.draft.context, ...partial } };
      storage.saveLlmTestDraft(draft);
      return { draft };
    }),
  setRun: (run) => set({ run, error: null }),
  setError: (error) => set({ error }),
  beginRun: () => set({ isRunning: true, startedAt: Date.now(), error: null }),
  finishRun: () => set({ isRunning: false, startedAt: null }),
}));