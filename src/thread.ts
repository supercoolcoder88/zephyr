import type {
  Image,
  PermissionRequest,
  Subthread,
  ThreadItem,
} from './agent-types';

export type ThreadState =
  | 'attention'
  | 'error'
  | 'done'
  | 'running'
  | 'draft'
  | 'read';

export const stateDot: Record<ThreadState, string> = {
  attention: 'bg-warn',
  error: 'bg-alert',
  done: 'bg-ok',
  running: 'animate-pulse bg-cyan',
  draft: 'bg-draft',
  read: 'bg-mute',
};

export interface Thread {
  id: string;
  title: string;
  cwd: string;
  updatedAt: number;
  // Outcome of the last run, cleared once the user has seen it.
  status?: 'attention' | 'error' | 'done';
  // Undefined until the session transcript is loaded.
  items?: ThreadItem[];
  // Subagents spawned by runs since the thread was opened.
  subthreads?: Subthread[];
  // Sent mid-turn; each moves into items once the CLI picks it up.
  queued?: (Extract<ThreadItem, { type: 'user' }> & { uuid: string })[];
  // Tool calls waiting for the user's answer, oldest first.
  permissions?: PermissionRequest[];
  // Not yet a Claude session; id is temporary until the first run's session event.
  draft?: true;
  // Unsent composer text and pasted images.
  prompt?: string;
  images?: Image[];
  // Original draft id, kept as the React key so promotion doesn't remount.
  key?: string;
}

const order: ThreadState[] = [
  'attention',
  'error',
  'done',
  'running',
  'draft',
  'read',
];

export function threadState(thread: Thread, runningIds: string[]): ThreadState {
  if (thread.permissions?.length) return 'attention';
  if (runningIds.includes(thread.id)) return 'running';
  if (thread.draft && (thread.prompt?.trim() || thread.images?.length))
    return 'draft';
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
