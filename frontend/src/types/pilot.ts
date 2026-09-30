export interface ServerConfig {
  model: string;
  project_dir: string;
  agents: string[];
  done_dir: string;
  pi_bin: string;
}

export type SubagentState = 'active' | 'stalled' | 'quiet' | 'ended';

export interface SubagentSession {
  provider?: 'pi' | 'opencode' | string;
  path: string;
  kind: 'primary' | 'subagent';
  agent: string;
  project?: string;
  task: string;
  task_tag?: string;
  state: SubagentState;
  messages: number;
  tokens: number;
  idle_seconds: number;
  last_activity: string;
  pid?: number;
}

export interface MonitorLogEvent {
  kind: 'tool' | 'result' | 'user' | 'assistant' | 'sys' | string;
  tool?: string;
  ts: string;
  text: string;
}

export type AnalysisEventType =
  | 'session'
  | 'agent_start'
  | 'agent_settled'
  | 'message_start'
  | 'message_update'
  | 'message_end'
  | 'tool_execution_end'
  | 'extension_ui_request'
  | 'roz_end'
  | 'roz_error'
  | 'roz_stderr';

export interface ExtensionUiRequest {
  id: string;
  method: 'confirm' | 'select' | 'input' | 'editor' | 'notify';
  title?: string;
  message?: string;
  options?: string[];
}

export interface AnalysisEvent {
  type: AnalysisEventType;
  cwd?: string;
  role?: string;
  content?: unknown;
  delta?: string;
  deltaType?: 'text_delta' | 'thinking_delta';
  toolName?: string;
  status?: string;
  exit_code?: number;
  message?: string;
  id?: string;
  method?: string;
  title?: string;
  options?: string[];
}

export interface AnalysisLogItem {
  id: string;
  kind: 'sys' | 'agent' | 'user' | 'text' | 'thinking' | 'toolu' | 'toolr' | 'dialog' | 'notify' | 'err';
  header: string;
  content: string;
  dialogData?: ExtensionUiRequest;
  answered?: string;
}
