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
  createdAt: number;
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
  // Percent of the context window used, known once a run finishes a turn.
  context?: number;
  // Original draft id, kept as the React key so promotion doesn't remount.
  key?: string;
}

export function threadState(thread: Thread, runningIds: string[]): ThreadState {
  if (thread.permissions?.length) return 'attention';
  if (runningIds.includes(thread.id)) return 'running';
  if (thread.draft && (thread.prompt?.trim() || thread.images?.length))
    return 'draft';
  return thread.status ?? 'read';
}

export function newThread(cwd: string): Thread {
  return {
    id: crypto.randomUUID(),
    title: 'New thread',
    cwd,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    items: [],
    draft: true,
  };
}

// Manual archive choices by session id; true archives, a timestamp unarchives and lists it from then.
export type ArchiveChoices = Record<string, true | number>;

// Read threads untouched since before today are archived unless chosen by hand.
export function listThreads(
  threads: Thread[],
  choices: ArchiveChoices,
  activeId: string | undefined,
  runningIds: string[],
) {
  const today = new Date().setHours(0, 0, 0, 0);
  const archived = threads.filter(
    (t) =>
      !t.draft &&
      threadState(t, runningIds) === 'read' &&
      (t.id in choices
        ? choices[t.id] === true
        : t.updatedAt < today && t.id !== activeId),
  );
  const listedAt = (t: Thread) =>
    Math.max(t.createdAt, Number(choices[t.id] ?? 0));
  const current = threads
    .filter((t) => !archived.includes(t))
    .toSorted((a, b) => listedAt(b) - listedAt(a));
  return { current, archived };
}
