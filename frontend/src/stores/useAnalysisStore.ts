import { create } from 'zustand';
import { storage } from '../services/storage';
import { AnalysisLogItem, ExtensionUiRequest } from '../types/pilot';

export const DEFAULT_PROMPT = `Analiza este documento markdown del proyecto (ruta: {file}).
Lee el archivo completo con tus herramientas y también los artefactos o rutas que mencione
(plan/, artifacts/, código citado). Responde EXACTAMENTE con este formato:

VEREDICTO: DONE | PENDING | IMPROVE
RAZÓN: <2-3 frases en español explicando por qué>
EVIDENCIA: <archivos/comandos revisados>
SUGERENCIAS:
- <acción concreta 1>
- <acción concreta 2>

NO modifiques ningún archivo, NO muevas nada. Solo analiza y reporta.`;

interface AnalysisState {
  activeRunId: string | null;
  isRunning: boolean;
  isIdle: boolean;
  hasUnseenEvent: boolean;
  logs: AnalysisLogItem[];
  prompt: string;
  selectedAgent: string;
  followUpInput: string;

  setActiveRunId: (runId: string | null) => void;
  setIsRunning: (running: boolean) => void;
  setIsIdle: (idle: boolean) => void;
  setHasUnseenEvent: (unseen: boolean) => void;
  setPrompt: (prompt: string) => void;
  setSelectedAgent: (agent: string) => void;
  setFollowUpInput: (input: string) => void;

  appendLog: (kind: AnalysisLogItem['kind'], header: string, content: string, dialogData?: ExtensionUiRequest) => void;
  appendToLastLog: (delta: string, kind: 'text' | 'thinking') => void;
  markDialogAnswered: (requestId: string, answerLabel: string) => void;
  clearLogs: () => void;
  reset: () => void;
}

const initialPrompt = storage.getCustomPrompt() || DEFAULT_PROMPT;

export const useAnalysisStore = create<AnalysisState>((set) => ({
  activeRunId: null,
  isRunning: false,
  isIdle: false,
  hasUnseenEvent: false,
  logs: [],
  prompt: initialPrompt,
  selectedAgent: 'none',
  followUpInput: '',

  setActiveRunId: (activeRunId) => set({ activeRunId }),
  setIsRunning: (isRunning) => set({ isRunning }),
  setIsIdle: (isIdle) => set({ isIdle }),
  setHasUnseenEvent: (hasUnseenEvent) => set({ hasUnseenEvent }),
  setPrompt: (prompt) => {
    storage.setCustomPrompt(prompt);
    set({ prompt });
  },
  setSelectedAgent: (selectedAgent) => set({ selectedAgent }),
  setFollowUpInput: (followUpInput) => set({ followUpInput }),

  appendLog: (kind, header, content, dialogData) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          kind,
          header,
          content,
          dialogData,
        },
      ],
    })),

  appendToLastLog: (delta, kind) =>
    set((state) => {
      const last = state.logs[state.logs.length - 1];
      if (last && last.kind === kind) {
        return {
          logs: [
            ...state.logs.slice(0, -1),
            { ...last, content: last.content + delta },
          ],
        };
      }
      return {
        logs: [
          ...state.logs,
          {
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            kind,
            header: kind === 'text' ? 'assistant' : 'thinking',
            content: delta,
          },
        ],
      };
    }),

  markDialogAnswered: (requestId, answerLabel) =>
    set((state) => ({
      logs: state.logs.map((log) =>
        log.dialogData?.id === requestId ? { ...log, answered: answerLabel } : log
      ),
    })),

  clearLogs: () => set({ logs: [] }),

  reset: () =>
    set({
      activeRunId: null,
      isRunning: false,
      isIdle: false,
      hasUnseenEvent: false,
      logs: [],
      followUpInput: '',
    }),
}));
