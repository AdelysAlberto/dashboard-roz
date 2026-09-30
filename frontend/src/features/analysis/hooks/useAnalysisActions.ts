import { api } from '../../../services/api';
import { useAnalysisStore } from '../../../stores/useAnalysisStore';
import { useDocSelectionStore } from '../../../stores/useDocSelectionStore';
import { useToastStore } from '../../../stores/useToastStore';

export function useAnalysisActions() {
  const setActiveRunId = useAnalysisStore((state) => state.setActiveRunId);
  const setIsRunning = useAnalysisStore((state) => state.setIsRunning);
  const setIsIdle = useAnalysisStore((state) => state.setIsIdle);
  const clearLogs = useAnalysisStore((state) => state.clearLogs);
  const appendLog = useAnalysisStore((state) => state.appendLog);
  const markDialogAnswered = useAnalysisStore((state) => state.markDialogAnswered);
  const setFollowUpInput = useAnalysisStore((state) => state.setFollowUpInput);
  const setActiveTab = useDocSelectionStore((state) => state.setActiveTab);
  const toast = useToastStore();

  const startAnalysis = async (path: string, prompt: string, agent?: string) => {
    try {
      clearLogs();
      setIsRunning(true);
      setIsIdle(false);
      setActiveTab('analysis');

      const res = await api.analyze({
        path,
        prompt,
        agent: agent === 'none' ? undefined : agent,
      });

      setActiveRunId(res.run_id);
      appendLog('sys', 'started', `Run ID: ${res.run_id} · Target: ${path}`);
    } catch (err) {
      setIsRunning(false);
      toast.error(err instanceof Error ? err.message : 'Failed to launch analysis');
    }
  };

  const sendFollowup = async (runId: string, message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    try {
      appendLog('user', 'You', trimmed);
      setFollowUpInput('');
      setIsIdle(false);
      await api.sendFollowup(runId, trimmed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send follow-up message');
    }
  };

  const answerUiDialog = async (
    runId: string,
    requestId: string,
    payload: Record<string, unknown>,
    answerLabel: string
  ) => {
    try {
      await api.sendUiAnswer(runId, requestId, payload);
      markDialogAnswered(requestId, answerLabel);
      appendLog('user', 'You answered', answerLabel);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to answer dialog');
    }
  };

  const closeAnalysisSession = async (runId: string) => {
    try {
      await api.closeRun(runId);
      setIsRunning(false);
      setActiveRunId(null);
      appendLog('sys', 'closed', 'Analysis session closed from the UI');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to close run');
    }
  };

  return {
    startAnalysis,
    sendFollowup,
    answerUiDialog,
    closeAnalysisSession,
  };
}
