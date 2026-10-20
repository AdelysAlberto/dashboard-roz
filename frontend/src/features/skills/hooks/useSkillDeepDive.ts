import { api } from '../../../services/api';
import { useAnalysisStore } from '../../../stores/useAnalysisStore';
import { useDocSelectionStore } from '../../../stores/useDocSelectionStore';
import { useToastStore } from '../../../stores/useToastStore';

/**
 * "Deep dive": hands the skill to a real pi run (tools + web search) instead of
 * the tool-less LLM API. The run then lives in the existing Analysis tab, so the
 * WebSocket, dialogs and follow-ups are reused as-is.
 */
export function useSkillDeepDive() {
  const clearLogs = useAnalysisStore((state) => state.clearLogs);
  const setIsRunning = useAnalysisStore((state) => state.setIsRunning);
  const setIsIdle = useAnalysisStore((state) => state.setIsIdle);
  const setActiveRunId = useAnalysisStore((state) => state.setActiveRunId);
  const appendLog = useAnalysisStore((state) => state.appendLog);
  const setActiveTab = useDocSelectionStore((state) => state.setActiveTab);
  const toast = useToastStore();

  const start = async (skillId: string, skillName: string, agent = 'none') => {
    try {
      clearLogs();
      setIsRunning(true);
      setIsIdle(false);
      setActiveTab('analysis');
      const res = await api.skillDeepDive(skillId, agent);
      setActiveRunId(res.run_id);
      appendLog(
        'sys',
        'deep dive · pi with tools',
        `Run ID: ${res.run_id}\nSkill: ${skillName}\nTarget: ${res.path}`
      );
      toast.info(`Researching "${skillName}"`, 'Deep dive started');
    } catch (err) {
      setIsRunning(false);
      toast.error(err instanceof Error ? err.message : 'Failed to start the deep dive');
    }
  };

  return { start };
}
