// Shared between main, preload and renderer. Keep it free of runtime imports.
export type AgentEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; input: unknown }
  | { type: 'done'; ok: boolean; result: string; costUsd: number }
  | { type: 'error'; message: string };

export type ThreadItem =
  | Exclude<AgentEvent, { type: 'session' }>
  | { type: 'user'; text: string };

export interface AgentApi {
  run(
    runId: string,
    prompt: string,
    cwd: string,
    resume?: string,
  ): Promise<void>;
  pickWorkspace(): Promise<string | undefined>;
  cancel(runId: string): Promise<void>;
  onEvent(listener: (runId: string, event: AgentEvent) => void): () => void;
  listThreads(
    cwd: string,
  ): Promise<{ id: string; title: string; updatedAt: number }[]>;
  loadThread(sessionId: string, cwd: string): Promise<ThreadItem[]>;
  deleteThread(sessionId: string, cwd: string): Promise<void>;
}
