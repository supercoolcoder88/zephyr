import { useEffect, useRef, useState } from 'react';
import ChatThread from './components/ChatThread';
import Sidebar from './components/Sidebar';
import { newThread, type Thread, type ThreadItem } from './thread';

export default function App() {
  const [workspace, setWorkspace] = useState<string>();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [runningId, setRunningId] = useState<string>();
  const [finishedId, setFinishedId] = useState<string>();
  // Agent events carry no thread id; they belong to whichever thread started the run.
  const runningRef = useRef<string>(undefined);

  function patch(id: string, update: (thread: Thread) => Thread) {
    setThreads((prev) => prev.map((t) => (t.id === id ? update(t) : t)));
  }

  function append(id: string, item: ThreadItem) {
    patch(id, (t) => ({ ...t, items: [...t.items, item] }));
  }

  useEffect(
    () =>
      window.agent.onEvent((event) => {
        const id = runningRef.current;
        if (!id) return;
        if (event.type === 'session') {
          patch(id, (t) => ({ ...t, sessionId: event.sessionId }));
        } else {
          append(id, event);
        }
      }),
    [],
  );

  const visible = threads.filter((t) => t.cwd === workspace);
  const active = visible.find((t) => t.id === activeId) ?? visible[0];

  async function send(prompt: string) {
    if (!active) return;
    const id = active.id;
    patch(id, (t) => ({
      ...t,
      title: t.items.length === 0 ? prompt.slice(0, 48) : t.title,
      items: [...t.items, { type: 'user', text: prompt }],
    }));
    runningRef.current = id;
    setRunningId(id);
    setFinishedId(undefined);
    try {
      // Passing the thread's session id continues the same conversation.
      await window.agent.run(prompt, active.cwd, active.sessionId);
    } finally {
      runningRef.current = undefined;
      setRunningId(undefined);
      setFinishedId(id);
    }
  }

  function select(id: string) {
    setActiveId(id);
    setFinishedId(undefined);
  }

  function create() {
    if (!workspace) return;
    const empty = visible.find((t) => t.items.length === 0);
    if (empty) return select(empty.id);
    const thread = newThread(workspace);
    setThreads((prev) => [...prev, thread]);
    select(thread.id);
  }

  async function openWorkspace() {
    const cwd = await window.agent.pickWorkspace();
    if (!cwd || cwd === workspace) return;
    setWorkspace(cwd);
    const existing = threads.find((t) => t.cwd === cwd);
    if (existing) return select(existing.id);
    const thread = newThread(cwd);
    setThreads((prev) => [...prev, thread]);
    select(thread.id);
  }

  if (!active) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-8 bg-void text-ink">
        <h1 className="text-5xl font-medium tracking-[0.3em]">ZEPHYR</h1>
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
        onSelect={select}
        onNew={create}
      />
      <ChatThread
        key={active.id}
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
