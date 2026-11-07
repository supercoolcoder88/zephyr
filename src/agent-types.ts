// Shared between main, preload and renderer. Keep it free of runtime imports.
export type AgentEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; input: unknown }
  | { type: 'done'; ok: boolean; result: string; costUsd: number }
  | { type: 'error'; message: string };

export interface AgentApi {
  run(prompt: string, resume?: string): Promise<void>;
  cancel(): Promise<void>;
  onEvent(listener: (event: AgentEvent) => void): () => void;
}
