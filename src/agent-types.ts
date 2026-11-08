// Shared between main, preload and renderer. Keep it free of runtime imports.
export type Output =
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; name: string; input: unknown };

// Subthread events are keyed by the tool_use id of the call that spawned the subagent.
export type AgentEvent =
  | { type: 'session'; sessionId: string }
  | Output
  | { type: 'done'; ok: boolean; result: string }
  | { type: 'error'; message: string }
  | { type: 'state'; state: 'running' | 'idle' | 'requires_action' }
  // The CLI started on these sent messages; ids are the uuids passed to send.
  | { type: 'picked'; ids: string[] }
  // The session's process is gone; the next send starts a new one.
  | { type: 'end' }
  | { type: 'subthread'; id: string; title: string }
  | { type: 'subthread-output'; id: string; output: Output }
  | { type: 'subthread-end'; id: string; ok: boolean }
  | { type: 'permission'; request: PermissionRequest }
  | { type: 'permission-end'; id: string };

export type Permission = 'ask' | 'auto';

export interface PermissionRequest {
  id: string;
  tool: string;
  input: unknown;
  title?: string;
}

export interface Image {
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  // Base64 without the data URL prefix.
  data: string;
}

export type ThreadItem =
  | Exclude<
      AgentEvent,
      {
        type:
          | 'session'
          | 'state'
          | 'picked'
          | 'end'
          | `subthread${string}`
          | `permission${string}`;
      }
    >
  | { type: 'user'; text: string; images?: Image[] };

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
  // Starts the run's session or queues into the live one; resolves once queued.
  send(
    runId: string,
    prompt: string,
    images: Image[],
    cwd: string,
    resume: string | undefined,
    choice: ModelChoice,
    permission: Permission,
    uuid: string,
  ): Promise<void>;
  setPermission(runId: string, permission: Permission): Promise<void>;
  answerPermission(runId: string, id: string, allow: boolean): Promise<void>;
  pickWorkspace(): Promise<string | undefined>;
  // Which of the paths, relative to cwd, exist.
  paths(
    cwd: string,
    candidates: string[],
  ): Promise<Record<string, 'file' | 'folder'>>;
  catalog(cwd: string): Promise<{ commands: SlashCommand[]; models: Model[] }>;
  // Stops the running turn and cancels every queued message.
  interrupt(runId: string): Promise<void>;
  close(runId: string): Promise<void>;
  // Null when plan rate limits don't apply, e.g. API key auth.
  usage(cwd: string): Promise<UsageWindow[] | null>;
  onEvent(listener: (runId: string, event: AgentEvent) => void): () => void;
  listThreads(
    cwd: string,
  ): Promise<{ id: string; title: string; updatedAt: number }[]>;
  loadThread(sessionId: string, cwd: string): Promise<ThreadItem[]>;
  deleteThread(sessionId: string, cwd: string): Promise<void>;
}
