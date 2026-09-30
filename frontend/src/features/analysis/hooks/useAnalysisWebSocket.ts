import { useEffect, useRef } from 'react';
import { api } from '../../../services/api';
import { useAnalysisStore } from '../../../stores/useAnalysisStore';
import { useDocSelectionStore } from '../../../stores/useDocSelectionStore';
import { AnalysisEvent, ExtensionUiRequest } from '../../../types/pilot';

export function useAnalysisWebSocket() {
  const activeRunId = useAnalysisStore((state) => state.activeRunId);
  const isRunning = useAnalysisStore((state) => state.isRunning);
  const setIsRunning = useAnalysisStore((state) => state.setIsRunning);
  const setIsIdle = useAnalysisStore((state) => state.setIsIdle);
  const setHasUnseenEvent = useAnalysisStore((state) => state.setHasUnseenEvent);
  const appendLog = useAnalysisStore((state) => state.appendLog);
  const appendToLastLog = useAnalysisStore((state) => state.appendToLastLog);
  const activeTab = useDocSelectionStore((state) => state.activeTab);

  const wsRef = useRef<WebSocket | null>(null);
  const eventSeqRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!activeRunId || !isRunning) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const url = `${protocol}//${host}/ws/analyze/${activeRunId}?since=${eventSeqRef.current}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        // Connected
      };

      ws.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data) as AnalysisEvent;
          eventSeqRef.current += 1;

          if (activeTab !== 'analysis') {
            setHasUnseenEvent(true);
          }

          const t = ev.type;

          if (t === 'session') {
            appendLog('sys', 'session', `cwd: ${ev.cwd || ''}`);
          } else if (t === 'agent_start') {
            appendLog('sys', 'agent', 'Run started · interactive agent session alive');
            setIsIdle(false);
          } else if (t === 'agent_settled') {
            setIsIdle(true);
          } else if (t === 'message_start') {
            // New message start
          } else if (t === 'message_update') {
            if (ev.deltaType === 'text_delta' && ev.delta) {
              appendToLastLog(ev.delta, 'text');
            } else if (ev.deltaType === 'thinking_delta' && ev.delta) {
              appendToLastLog(ev.delta, 'thinking');
            }
          } else if (t === 'message_end') {
            if (ev.role === 'assistant' && Array.isArray(ev.content)) {
              for (const part of ev.content) {
                if (part.type === 'toolCall' || part.type === 'tool_use') {
                  const toolName = part.name ?? '?';
                  const args = JSON.stringify(part.arguments ?? part.input ?? {}).slice(0, 800);
                  appendLog('toolu', `tool · ${toolName}`, args);
                }
              }
            }
          } else if (t === 'tool_execution_end') {
            appendLog('toolr', `result · ${ev.toolName || 'tool'}`, (ev.content as string || '').slice(0, 1200));
          } else if (t === 'extension_ui_request') {
            if (ev.method === 'notify') {
              appendLog('notify', 'Notification from agent', ev.message || '');
            } else if (['select', 'confirm', 'input', 'editor'].includes(ev.method || '')) {
              appendLog('dialog', 'Agent is requesting input', ev.message || ev.title || '', {
                id: ev.id || '',
                method: ev.method as ExtensionUiRequest['method'],
                title: ev.title,
                message: ev.message,
                options: ev.options,
              });
            }
          } else if (t === 'roz_end') {
            appendLog('sys', 'done', `Session ended: ${ev.status || 'complete'}${ev.exit_code != null ? ` (exit ${ev.exit_code})` : ''}`);
            setIsRunning(false);
            setHasUnseenEvent(false);
          } else if (t === 'roz_error') {
            appendLog('err', 'error', ev.message || 'Unknown error');
          } else if (t === 'roz_stderr') {
            if (!/Dynamic tool activation/.test(ev.message || '')) {
              appendLog('err', 'stderr', (ev.message || '').slice(0, 600));
            }
          }
        } catch (err) {
          console.error('Error parsing WS message', err);
        }
      };

      ws.onclose = () => {
        // Check if run is still alive
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(async () => {
          try {
            const st = await api.getRunState(activeRunId);
            if (!st.exited && isRunning) {
              connect();
            } else {
              setIsRunning(false);
            }
          } catch {
            setIsRunning(false);
          }
        }, 1000);
      };

      ws.onerror = () => {
        // Handled by close
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [activeRunId, isRunning, appendLog, appendToLastLog, setIsRunning, setIsIdle, setHasUnseenEvent, activeTab]);
}
