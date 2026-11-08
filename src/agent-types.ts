// Shared between main, preload and renderer. Keep it free of runtime imports.
export type Output =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; input: unknown };

// Subthread events are keyed by the tool_use id of the call that spawned the subagent.
export type AgentEvent =
  | { type: 'session'; sessionId: string }
  | Output
  | { type: 'done'; ok: boolean; result: string }
  | { type: 'error'; message: string }
  | { type: 'subthread'; id: string; title: string }
  | { type: 'subthread-output'; id: string; output: Output }
  | { type: 'subthread-end'; id: string; ok: boolean };

export type ThreadItem =
  | Exclude<AgentEvent, { type: 'session' | `subthread${string}` }>
  | { type: 'user'; text: string };

export interface Subthread {
  id: string;
  title: string;
  items: Output[];
  // 'read' marks a subagent that never reported ending, e.g. after a cancel.
  state: 'running' | 'done' | 'error' | 'read';
}

export interface SlashCommand {
  name: string;
  description: string;
  argumentHint: string;
}

export interface UsageWindow {
  label: string;
  // Percent used, 0-100.
  utilization: number;
  resetsAt: string | null;
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface Model {
  value: string;
  displayName: string;
  efforts: Effort[];
  // What Claude Code uses when no effort is sent.
  defaultEffort?: Effort;
}

// No effort means Claude Code's default for the model.
export interface ModelChoice {
  model: string;
  effort?: Effort;
}

export interface AgentApi {
  run(
    runId: string,
    prompt: string,
    cwd: string,
    resume: string | undefined,
    choice: ModelChoice,
  ): Promise<void>;
  pickWorkspace(): Promise<string | undefined>;
  catalog(cwd: string): Promise<{ commands: SlashCommand[]; models: Model[] }>;
  cancel(runId: string): Promise<void>;
  // Null when plan rate limits don't apply, e.g. API key auth.
  usage(cwd: string): Promise<UsageWindow[] | null>;
  onEvent(listener: (runId: string, event: AgentEvent) => void): () => void;
  listThreads(
    cwd: string,
  ): Promise<{ id: string; title: string; updatedAt: number }[]>;
  loadThread(sessionId: string, cwd: string): Promise<ThreadItem[]>;
  deleteThread(sessionId: string, cwd: string): Promise<void>;
}
