import type { AgentEvent } from './agent-types';

export type ThreadItem =
  | Exclude<AgentEvent, { type: 'session' }>
  | { type: 'user'; text: string };

export interface Thread {
  id: string;
  title: string;
  sessionId?: string;
  items: ThreadItem[];
}

export function newThread(): Thread {
  return { id: crypto.randomUUID(), title: 'New thread', items: [] };
}
