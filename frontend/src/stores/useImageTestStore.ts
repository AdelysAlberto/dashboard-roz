import { create } from 'zustand';
import { storage } from '../services/storage';
import { ImageTestDraft, ImageTestRun } from '../types/imageTest';

export const EMPTY_IMAGE_DRAFT: ImageTestDraft = {
  api_url: '',
  api_key: '',
  backend: 'auto',
  model: '',
  steps: '50',
  guidance: '4',
  seed: '',
  orientation: '1:1',
  negative_prompt: '',
  master_prompt: '',
  user_prompt: '',
};

interface ImageTestState {
  draft: ImageTestDraft;
  run: ImageTestRun | null;
  error: string | null;
  isRunning: boolean;
  startedAt: number | null;
  patch: (partial: Partial<ImageTestDraft>) => void;
  beginRun: () => void;
  finishRun: () => void;
  setRun: (run: ImageTestRun) => void;
  setError: (error: string | null) => void;
}

const initialDraft = storage.getImageTestDraft();

// EMPTY_IMAGE_DRAFT first: a draft saved by an older build may predate any field.
export const useImageTestStore = create<ImageTestState>((set) => ({
  draft: { ...EMPTY_IMAGE_DRAFT, ...initialDraft },
  run: null,
  error: null,
  isRunning: false,
  startedAt: null,
  patch: (partial) =>
    set((state) => {
      const draft = { ...state.draft, ...partial };
      storage.saveImageTestDraft(draft);
      return { draft };
    }),
  beginRun: () => set({ isRunning: true, startedAt: Date.now(), error: null }),
  finishRun: () => set({ isRunning: false, startedAt: null }),
  setRun: (run) => set({ run, error: null }),
  setError: (error) => set({ error }),
}));
