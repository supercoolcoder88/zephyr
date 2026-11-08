import { useEffect, useRef, useState } from 'react';
import ChatThread from './components/chat/ChatThread';
import Sidebar from './components/sidebar/Sidebar';
import type { Image, ModelChoice, Permission, ThreadItem } from './agent-types';
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
        subthreads: known?.subthreads,
        permissions: known?.permissions,
        queued: known?.queued,
        key: known?.key,
        prompt: known?.prompt,
        images: known?.images,
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
  const [permission, setPermission] = useState(
    () => (localStorage.getItem('permission') ?? 'ask') as Permission,
  );
  // Run id -> the thread whose session it drives; a draft's id changes when its session starts.
  const runs = useRef(
    new Map<
      string,
      {
        id: string;
        cwd: string;
        draft?: true;
        running?: boolean;
        stopping?: boolean;
      }
    >(),
  );
  const runningThreads = () =>
    [...runs.current.values()].filter((r) => r.running).map((r) => r.id);
  const runOf = (id: string) =>
    [...runs.current].find(([, r]) => r.id === id)?.[0];
  const composer = useRef<HTMLTextAreaElement>(null);

  function patch(id: string, update: (thread: Thread) => Thread) {
    setThreads((prev) => prev.map((t) => (t.id === id ? update(t) : t)));
  }

  function append(id: string, item: ThreadItem) {
    patch(id, (t) => ({ ...t, items: [...(t.items ?? []), item] }));
  }

  const report = (id: string) => (err: unknown) =>
    append(id, {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });

  function dropPermission(threadId: string, id: string) {
    patch(threadId, (t) => ({
      ...t,
      permissions: t.permissions?.filter((p) => p.id !== id),
    }));
  }

  async function finish(runId: string) {
    const run = runs.current.get(runId);
    if (!run?.running) return;
    run.running = false;
    run.stopping = false;
    // An interrupted turn never reports its subagents ending.
    patch(run.id, (t) => ({
      ...t,
      permissions: undefined,
      subthreads: t.subthreads?.map((s) =>
        s.state === 'running' ? { ...s, state: 'read' } : s,
      ),
    }));
    setFinishedId(run.id);
    setRunningIds((prev) => prev.filter((t) => t !== run.id));
    const { cwd } = run;
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

  useEffect(
    () =>
      window.agent.onEvent((runId, event) => {
        const run = runs.current.get(runId);
        if (!run) return;
        if (event.type === 'end') {
          patch(run.id, (t) =>
            t.queued?.length
              ? {
                  ...t,
                  queued: undefined,
                  items: [
                    ...(t.items ?? []),
                    { type: 'error', message: 'Queued messages were not sent' },
                  ],
                }
              : t,
          );
          return finish(runId);
        }
        if (event.type === 'picked') {
          return patch(run.id, (t) => {
            const picked = t.queued?.filter((q) => event.ids.includes(q.uuid));
            if (!picked?.length) return t;
            return {
              ...t,
              queued: t.queued?.filter((q) => !picked.includes(q)),
              items: [...(t.items ?? []), ...picked],
            };
          });
        }
        if (event.type === 'done' && run.stopping) {
          run.stopping = false;
          patch(run.id, (t) => ({
            ...t,
            status: 'error',
            updatedAt: Date.now(),
            items: [...(t.items ?? []), { type: 'error', message: 'STOPPED' }],
          }));
          return;
        }
        if (event.type === 'state') {
          if (event.state === 'idle') finish(runId);
          if (event.state === 'running' && !run.running) {
            run.running = true;
            setFinishedId(undefined);
            setRunningIds((prev) =>
              prev.includes(run.id) ? prev : [...prev, run.id],
            );
          }
          return;
        }
        if (event.type === 'done' || event.type === 'error') {
          const status = event.type === 'done' && event.ok ? 'done' : 'error';
          patch(run.id, (t) => ({ ...t, status, updatedAt: Date.now() }));
        }
        if (event.type === 'permission') {
          return patch(run.id, (t) => ({
            ...t,
            permissions: [...(t.permissions ?? []), event.request],
          }));
        }
        if (event.type === 'permission-end') {
          return dropPermission(run.id, event.id);
        }
        if (event.type === 'subthread') {
          const { id, title } = event;
          return patch(run.id, (t) => ({
            ...t,
            subthreads: [
              ...(t.subthreads ?? []),
              { id, title, items: [], state: 'running' },
            ],
          }));
        }
        if (event.type === 'subthread-output') {
          return patch(run.id, (t) => ({
            ...t,
            subthreads: t.subthreads?.map((s) =>
              s.id === event.id
                ? { ...s, items: [...s.items, event.output] }
                : s,
            ),
          }));
        }
        if (event.type === 'subthread-end') {
          return patch(run.id, (t) => ({
            ...t,
            subthreads: t.subthreads?.map((s) =>
              s.id === event.id
                ? { ...s, state: event.ok ? 'done' : 'error' }
                : s,
            ),
          }));
        }
        if (event.type !== 'session') return append(run.id, event);
        if (!run.draft) return;
        // A draft becomes a real thread once Claude assigns its session id.
        const { sessionId } = event;
        runs.current.set(runId, { ...run, id: sessionId, draft: undefined });
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

  function send(prompt: string, images: Image[], choice: ModelChoice) {
    if (!active) return;
    setDeleteError(undefined);
    const { id, cwd, draft } = active;
    const uuid = crypto.randomUUID();
    const message = {
      type: 'user' as const,
      text: prompt,
      ...(images.length > 0 && { images }),
    };
    const runId = runOf(id) ?? crypto.randomUUID();
    const queue = runs.current.get(runId)?.running;
    patch(id, (t) => ({
      ...t,
      title:
        t.draft && t.items?.length === 0 && prompt
          ? prompt.slice(0, 48)
          : t.title,
      status: undefined,
      updatedAt: Date.now(),
      images: undefined,
      ...(queue
        ? { queued: [...(t.queued ?? []), { ...message, uuid }] }
        : { items: [...(t.items ?? []), message] }),
    }));
    runs.current.set(runId, {
      ...runs.current.get(runId),
      id,
      cwd,
      draft,
      running: true,
    });
    setRunningIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setFinishedId(undefined);
    window.agent
      .send(
        runId,
        prompt,
        images,
        cwd,
        draft ? undefined : id,
        choice,
        permission,
        uuid,
      )
      .catch((err) => {
        report(runs.current.get(runId)!.id)(err);
        finish(runId);
      });
  }

  function select(thread: Thread) {
    // Leaving or opening a thread marks its outcome as seen; an untouched
    // draft is dropped once left.
    const abandoned =
      active?.id !== thread.id &&
      active?.draft &&
      active.items?.length === 0 &&
      !active.prompt?.trim() &&
      !active.images?.length;
    setThreads((prev) =>
      (abandoned ? prev.filter((t) => t.id !== active.id) : prev).map((t) =>
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
    const empty = visible.find(
      (t) =>
        t.draft &&
        t.items?.length === 0 &&
        !t.prompt?.trim() &&
        !t.images?.length,
    );
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
    const runId = runOf(id);
    if (runId) {
      runs.current.delete(runId);
      await window.agent.close(runId);
    }
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
    for (const [runId, run] of runs.current) {
      if (run.cwd === workspace && !run.running)
        window.agent.close(runId).catch(report(run.id));
    }
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
    <main className="flex h-screen overflow-hidden bg-void text-ink">
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
        permission={permission}
        onPermission={(next) => {
          setPermission(next);
          localStorage.setItem('permission', next);
          for (const [runId, run] of runs.current) {
            window.agent.setPermission(runId, next).catch(report(run.id));
          }
        }}
      />
      <ChatThread
        key={active.key ?? active.id}
        thread={active}
        running={runningIds.includes(active.id)}
        justFinished={finishedId === active.id}
        onSend={send}
        onPrompt={(prompt) => patch(active.id, (t) => ({ ...t, prompt }))}
        onImages={(update) =>
          patch(active.id, (t) => ({ ...t, images: update(t.images ?? []) }))
        }
        onCancel={() => {
          const runId = runOf(active.id);
          const run = runId && runs.current.get(runId);
          if (!run) return;
          run.stopping = run.running;
          patch(active.id, (t) => ({ ...t, queued: undefined }));
          window.agent.interrupt(runId).catch(report(active.id));
        }}
        onAnswer={(id, allow) => {
          dropPermission(active.id, id);
          window.agent
            .answerPermission(runOf(active.id)!, id, allow)
            .catch(report(active.id));
        }}
        composer={composer}
      />
    </main>
  );
}
