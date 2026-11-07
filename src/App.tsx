import { useEffect, useRef, useState } from 'react';
import ChatThread from './components/ChatThread';
import Sidebar from './components/Sidebar';
import type { ThreadItem } from './agent-types';
import { newThread, type Thread } from './thread';

type Listed = Awaited<ReturnType<typeof window.agent.listThreads>>;

// Keeps unsent drafts plus loaded transcripts and render keys of listed threads.
function merge(mine: Thread[], cwd: string, list: Listed): Thread[] {
  return [
    ...mine.filter((t) => t.draft && !list.some((l) => l.id === t.id)),
    ...list.map(({ id, title }) => {
      const known = mine.find((t) => t.id === id);
      return { id, title, cwd, items: known?.items, key: known?.key };
    }),
  ];
}

export default function App() {
  const [workspace, setWorkspace] = useState<string>();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [runningId, setRunningId] = useState<string>();
  const [finishedId, setFinishedId] = useState<string>();
  const [deleteError, setDeleteError] = useState<string>();
  // Agent events carry no thread id; they belong to whichever thread started the run.
  const runningRef = useRef<{ id: string; draft?: true }>(undefined);

  function patch(id: string, update: (thread: Thread) => Thread) {
    setThreads((prev) => prev.map((t) => (t.id === id ? update(t) : t)));
  }

  function append(id: string, item: ThreadItem) {
    patch(id, (t) => ({ ...t, items: [...(t.items ?? []), item] }));
  }

  useEffect(
    () =>
      window.agent.onEvent((event) => {
        const run = runningRef.current;
        if (!run) return;
        if (event.type !== 'session') return append(run.id, event);
        if (!run.draft) return;
        // A draft becomes a real thread once Claude assigns its session id.
        const { sessionId } = event;
        runningRef.current = { id: sessionId };
        patch(run.id, (t) => ({
          ...t,
          key: t.key ?? t.id,
          id: sessionId,
          draft: undefined,
        }));
        setActiveId((a) => (a === run.id ? sessionId : a));
        setRunningId(sessionId);
      }),
    [],
  );

  const visible = threads.filter((t) => t.cwd === workspace);
  const active = visible.find((t) => t.id === activeId) ?? visible[0];

  async function send(prompt: string) {
    if (!active) return;
    setDeleteError(undefined);
    const { id, cwd, draft } = active;
    patch(id, (t) => ({
      ...t,
      title: t.draft && t.items?.length === 0 ? prompt.slice(0, 48) : t.title,
      items: [...(t.items ?? []), { type: 'user', text: prompt }],
    }));
    runningRef.current = { id, draft };
    setRunningId(id);
    setFinishedId(undefined);
    try {
      await window.agent.run(prompt, cwd, draft ? undefined : id);
    } finally {
      setFinishedId(runningRef.current?.id);
      runningRef.current = undefined;
      setRunningId(undefined);
    }
    const list = await window.agent.listThreads(cwd);
    setThreads((prev) => [
      ...prev.filter((t) => t.cwd !== cwd),
      ...merge(
        prev.filter((t) => t.cwd === cwd),
        cwd,
        list,
      ),
    ]);
  }

  function select(thread: Thread) {
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
    if (empty) return select(empty);
    const thread = newThread(workspace);
    setThreads((prev) => [thread, ...prev]);
    select(thread);
  }

  async function remove(id: string) {
    const thread = visible.find((t) => t.id === id)!;
    if (id === runningId) return;
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
        runningId={runningId}
        onSelect={(id) => select(visible.find((t) => t.id === id)!)}
        onNew={create}
        onDelete={remove}
        error={deleteError}
      />
      <ChatThread
        key={active.key ?? active.id}
        thread={active}
        running={runningId === active.id}
        busy={runningId !== undefined && runningId !== active.id}
        justFinished={finishedId === active.id}
        onSend={send}
        onCancel={() => window.agent.cancel()}
      />
    </main>
  );
}
