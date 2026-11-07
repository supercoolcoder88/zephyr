import { useEffect, useRef, useState } from 'react';
import ChatThread from './components/ChatThread';
import Sidebar from './components/Sidebar';
import { newThread, type Thread, type ThreadItem } from './thread';

export default function App() {
  const [threads, setThreads] = useState<Thread[]>(() => [newThread()]);
  const [activeId, setActiveId] = useState(threads[0].id);
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

  const active = threads.find((t) => t.id === activeId) ?? threads[0];

  async function send(prompt: string) {
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
      await window.agent.run(prompt, active.sessionId);
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
    const empty = threads.find((t) => t.items.length === 0);
    if (empty) return select(empty.id);
    const thread = newThread();
    setThreads((prev) => [...prev, thread]);
    select(thread.id);
  }

  return (
    <main className="flex h-screen bg-void text-ink">
      <Sidebar
        threads={threads}
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
