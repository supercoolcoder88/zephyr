import { useEffect, useRef, useState } from 'react';
import ChatThread from './components/ChatThread';
import Sidebar from './components/Sidebar';
import type { ThreadItem } from './agent-types';
import { newThread, sortThreads, type Thread } from './thread';

type Listed = Awaited<ReturnType<typeof window.agent.listThreads>>;

// Keeps unsent drafts and running threads the list doesn't know about yet,
// plus loaded transcripts and render keys of listed threads.
function merge(
  mine: Thread[],
  cwd: string,
  list: Listed,
  running: string[],
): Thread[] {
  return [
    ...mine.filter(
      (t) =>
        (t.draft || running.includes(t.id)) && !list.some((l) => l.id === t.id),
    ),
    ...list.map(({ id, title, updatedAt }) => {
      const known = mine.find((t) => t.id === id);
      return {
        id,
        title,
        cwd,
        updatedAt,
        status: known?.status,
        items: known?.items,
        key: known?.key,
      };
    }),
  ];
}

export default function App() {
  const [workspace, setWorkspace] = useState<string>();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [runningIds, setRunningIds] = useState<string[]>([]);
  const [finishedId, setFinishedId] = useState<string>();
  const [deleteError, setDeleteError] = useState<string>();
  // Run id -> the thread it belongs to; a draft's id changes when its session starts.
  const runs = useRef(new Map<string, { id: string; draft?: true }>());
  const runningThreads = () => [...runs.current.values()].map((r) => r.id);
  const composer = useRef<HTMLTextAreaElement>(null);

  function patch(id: string, update: (thread: Thread) => Thread) {
    setThreads((prev) => prev.map((t) => (t.id === id ? update(t) : t)));
  }

  function append(id: string, item: ThreadItem) {
    patch(id, (t) => ({ ...t, items: [...(t.items ?? []), item] }));
  }

  useEffect(
    () =>
      window.agent.onEvent((runId, event) => {
        const run = runs.current.get(runId);
        if (!run) return;
        if (event.type === 'done' || event.type === 'error') {
          const status = event.type === 'done' && event.ok ? 'done' : 'error';
          patch(run.id, (t) => ({ ...t, status, updatedAt: Date.now() }));
        }
        if (event.type !== 'session') return append(run.id, event);
        if (!run.draft) return;
        // A draft becomes a real thread once Claude assigns its session id.
        const { sessionId } = event;
        runs.current.set(runId, { id: sessionId });
        patch(run.id, (t) => ({
          ...t,
          key: t.key ?? t.id,
          id: sessionId,
          draft: undefined,
        }));
        setActiveId((a) => (a === run.id ? sessionId : a));
        setRunningIds((prev) =>
          prev.map((id) => (id === run.id ? sessionId : id)),
        );
      }),
    [],
  );

  const visible = sortThreads(
    threads.filter((t) => t.cwd === workspace),
    runningIds,
  );
  const active = visible.find((t) => t.id === activeId) ?? visible[0];

  async function send(prompt: string) {
    if (!active) return;
    setDeleteError(undefined);
    const { id, cwd, draft } = active;
    patch(id, (t) => ({
      ...t,
      title: t.draft && t.items?.length === 0 ? prompt.slice(0, 48) : t.title,
      status: undefined,
      updatedAt: Date.now(),
      items: [...(t.items ?? []), { type: 'user', text: prompt }],
    }));
    const runId = crypto.randomUUID();
    runs.current.set(runId, { id, draft });
    setRunningIds((prev) => [...prev, id]);
    setFinishedId(undefined);
    try {
      await window.agent.run(runId, prompt, cwd, draft ? undefined : id);
    } finally {
      const finished = runs.current.get(runId)!.id;
      runs.current.delete(runId);
      setFinishedId(finished);
      setRunningIds((prev) => prev.filter((t) => t !== finished));
    }
    const list = await window.agent.listThreads(cwd);
    setThreads((prev) => [
      ...prev.filter((t) => t.cwd !== cwd),
      ...merge(
        prev.filter((t) => t.cwd === cwd),
        cwd,
        list,
        runningThreads(),
      ),
    ]);
  }

  function select(thread: Thread) {
    // Leaving or opening a thread marks its outcome as seen.
    setThreads((prev) =>
      prev.map((t) =>
        t.id === thread.id || t.id === active?.id
          ? { ...t, status: undefined }
          : t,
      ),
    );
    setActiveId(thread.id);
    setFinishedId(undefined);
    setDeleteError(undefined);
    if (thread.items) return;
    window.agent.loadThread(thread.id, thread.cwd).then(
      (items) => patch(thread.id, (t) => ({ ...t, items })),
      (err) =>
        patch(thread.id, (t) => ({
          ...t,
          items: [
            {
              type: 'error',
              message: err instanceof Error ? err.message : String(err),
            },
          ],
        })),
    );
  }

  function create() {
    if (!workspace) return;
    const empty = visible.find((t) => t.draft && t.items?.length === 0);
    if (empty) {
      select(empty);
      composer.current?.focus();
      return;
    }
    const thread = newThread(workspace);
    setThreads((prev) => [thread, ...prev]);
    select(thread);
  }

  async function remove(id: string) {
    const thread = visible.find((t) => t.id === id)!;
    if (runningIds.includes(id)) return;
    setDeleteError(undefined);
    if (!thread.draft) {
      try {
        await window.agent.deleteThread(id, thread.cwd);
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : String(err));
        return;
      }
    }
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (thread !== active) return;
    const i = visible.indexOf(thread);
    const next = visible[i + 1] ?? visible[i - 1];
    if (next) return select(next);
    const fresh = newThread(thread.cwd);
    setThreads((prev) => [fresh, ...prev]);
    select(fresh);
  }

  async function openWorkspace() {
    setDeleteError(undefined);
    const cwd = await window.agent.pickWorkspace();
    if (!cwd || cwd === workspace) return;
    const list = await window.agent.listThreads(cwd);
    const mine = merge(
      threads.filter((t) => t.cwd === cwd),
      cwd,
      list,
      runningThreads(),
    );
    const loaded = mine.length ? mine : [newThread(cwd)];
    setThreads((prev) => [...prev.filter((t) => t.cwd !== cwd), ...loaded]);
    setWorkspace(cwd);
    select(loaded[0]);
  }

  if (!active) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-8 bg-void text-ink">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-5xl font-medium tracking-[0.3em]">ZEPHYR</h1>
          {import.meta.env.DEV && (
            <span className="text-2xs tracking-widest text-mute">DEV</span>
          )}
        </div>
        <button
          type="button"
          onClick={openWorkspace}
          className="chamfer bg-paper px-6 py-3 text-2xs tracking-widest text-void transition-opacity duration-150 ease-mech hover:opacity-80"
        >
          [ OPEN PROJECT ]
        </button>
      </main>
    );
  }

  return (
    <main className="flex h-screen bg-void text-ink">
      <Sidebar
        workspace={active.cwd}
        onOpenWorkspace={openWorkspace}
        threads={visible}
        activeId={active.id}
        runningIds={runningIds}
        onSelect={(id) => select(visible.find((t) => t.id === id)!)}
        onNew={create}
        onDelete={remove}
        error={deleteError}
      />
      <ChatThread
        key={active.key ?? active.id}
        thread={active}
        running={runningIds.includes(active.id)}
        justFinished={finishedId === active.id}
        onSend={send}
        onCancel={() => {
          for (const [runId, run] of runs.current) {
            if (run.id === active.id) window.agent.cancel(runId);
          }
        }}
        composer={composer}
      />
    </main>
  );
}
