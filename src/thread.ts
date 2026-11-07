import type { ThreadItem } from './agent-types';

export type ThreadState = 'attention' | 'error' | 'done' | 'running' | 'read';

export interface Thread {
  id: string;
  title: string;
  cwd: string;
  updatedAt: number;
  // Outcome of the last run, cleared once the user has seen it.
  status?: 'attention' | 'error' | 'done';
  // Undefined until the session transcript is loaded.
  items?: ThreadItem[];
  // Not yet a Claude session; id is temporary until the first run's session event.
  draft?: true;
  // Original draft id, kept as the React key so promotion doesn't remount.
  key?: string;
}

const order: ThreadState[] = ['attention', 'error', 'done', 'running', 'read'];

export function threadState(thread: Thread, runningIds: string[]): ThreadState {
  if (runningIds.includes(thread.id)) return 'running';
  return thread.status ?? 'read';
}

export function sortThreads(threads: Thread[], runningIds: string[]) {
  return threads.toSorted(
    (a, b) =>
      Number(!!b.draft) - Number(!!a.draft) ||
      order.indexOf(threadState(a, runningIds)) -
        order.indexOf(threadState(b, runningIds)) ||
      b.updatedAt - a.updatedAt,
  );
}

export function newThread(cwd: string): Thread {
  return {
    id: crypto.randomUUID(),
    title: 'New thread',
    cwd,
    updatedAt: Date.now(),
    items: [],
    draft: true,
  };
}
