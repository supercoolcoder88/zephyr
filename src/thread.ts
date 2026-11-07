import type { AgentEvent } from './agent-types';

export type ThreadItem =
  | Exclude<AgentEvent, { type: 'session' }>
  | { type: 'user'; text: string };

export interface Thread {
  id: string;
  title: string;
  cwd: string;
  sessionId?: string;
  items: ThreadItem[];
}

export function newThread(cwd: string): Thread {
  return { id: crypto.randomUUID(), title: 'New thread', cwd, items: [] };
}
