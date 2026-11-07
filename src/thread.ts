import type { ThreadItem } from './agent-types';

export interface Thread {
  id: string;
  title: string;
  cwd: string;
  // Undefined until the session transcript is loaded.
  items?: ThreadItem[];
  // Not yet a Claude session; id is temporary until the first run's session event.
  draft?: true;
  // Original draft id, kept as the React key so promotion doesn't remount.
  key?: string;
}

export function newThread(cwd: string): Thread {
  return {
    id: crypto.randomUUID(),
    title: 'New thread',
    cwd,
    items: [],
    draft: true,
  };
}
