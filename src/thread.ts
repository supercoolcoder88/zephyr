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
  | 'unmerged'
  | 'read';

export const stateDot: Record<ThreadState, string> = {
  attention: 'bg-warn',
  error: 'bg-alert',
  done: 'bg-ok',
  running: 'animate-pulse bg-cyan',
  draft: 'bg-draft',
  unmerged: 'bg-unmerged',
  read: 'bg-mute',
};

export interface Thread {
  id: string;
  title: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  // Outcome of the last run, cleared once the user has seen it.
  status?: 'error' | 'done';
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
  // Stable for the thread's life; a draft's id changes when its session starts.
  key: string;
  // The session driving this thread, keyed by a renderer-chosen run id.
  run?: {
    id: string;
    phase: 'starting' | 'running' | 'stopping' | 'idle';
    // Where the session runs, known once an isolated thread's worktree exists.
    dir?: Promise<string>;
  };
  // A draft that gets its own worktree when its first message is sent.
  isolated?: true;
  // The thread's git worktree folder and branch, when it runs in one.
  worktree?: string;
  branch?: string;
  // The last merge into the workspace's branch hit conflicts.
  conflict?: true;
}

export const busy = (thread: Thread) =>
  !!thread.run && thread.run.phase !== 'idle';

export function threadState(thread: Thread): ThreadState {
  if (thread.permissions?.length) return 'attention';
  if (busy(thread)) return 'running';
  if (thread.draft && (thread.prompt?.trim() || thread.images?.length))
    return 'draft';
  // Merging removes the worktree, so any thread still in one is unmerged.
  return thread.status ?? (thread.worktree ? 'unmerged' : 'read');
}

export function newThread(cwd: string): Thread {
  const id = crypto.randomUUID();
  return {
    id,
    key: id,
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

// Pin times by session id; pinned threads list first in pin order.
export type Pins = Record<string, number>;

// Read threads untouched since before today are archived unless chosen by hand;
// unmerged ones only by hand, pinned ones never.
export function listThreads(
  threads: Thread[],
  choices: ArchiveChoices,
  pins: Pins,
  activeKey: string | undefined,
) {
  const today = new Date().setHours(0, 0, 0, 0);
  const archived = threads.filter((t) => {
    const state = threadState(t);
    if (t.draft || t.id in pins || (state !== 'read' && state !== 'unmerged'))
      return false;
    return t.id in choices
      ? choices[t.id] === true
      : state === 'read' && t.updatedAt < today && t.key !== activeKey;
  });
  const listedAt = (t: Thread) =>
    Math.max(t.createdAt, Number(choices[t.id] ?? 0));
  const current = threads
    .filter((t) => !archived.includes(t))
    .toSorted(
      (a, b) =>
        (pins[a.id] ?? Infinity) - (pins[b.id] ?? Infinity) ||
        listedAt(b) - listedAt(a),
    );
  return { current, archived };
}
