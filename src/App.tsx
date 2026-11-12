import { useEffect, useRef, useState, type DragEvent } from 'react';
import { flushSync } from 'react-dom';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
} from 'react-resizable-panels';
import ChatThread from './components/chat/ChatThread';
import Sidebar from './components/sidebar/Sidebar';
import { read, write } from './storage';
import { DEFAULT_MODEL } from './components/composer/Composer';
import Backlog, { backlogType } from './components/backlog/Backlog';
import Button from './components/ui/Button';
import type { Image, ModelChoice, Permission, ThreadItem } from './agent-types';
import {
  busy,
  listThreads,
  newThread,
  type ArchiveChoices,
  type Pins,
  type Thread,
} from './thread';

type Listed = Awaited<ReturnType<typeof window.agent.listThreads>>;

const MAX_PROJECTS = 4;

// Keeps unsent drafts and running threads the list doesn't know about yet,
// plus loaded transcripts and render keys of listed threads.
function merge(mine: Thread[], cwd: string, list: Listed): Thread[] {
  const saved = read<Record<string, number>>('context', {});
  return [
    ...mine.filter(
      (t) => (t.draft || busy(t)) && !list.some((l) => l.id === t.id),
    ),
    ...list.map(({ id, title, createdAt, updatedAt, worktree, branch }) => {
      const known = mine.find((t) => t.id === id);
      return {
        id,
        title,
        cwd,
        worktree,
        branch,
        createdAt,
        updatedAt,
        status: known?.status,
        items: known?.items,
        subthreads: known?.subthreads,
        permissions: known?.permissions,
        queued: known?.queued,
        key: known?.key ?? id,
        run: known?.run,
        prompt: known?.prompt,
        images: known?.images,
        context: known?.context ?? saved[id],
        conflict: known?.conflict,
      };
    }),
  ];
}

export default function App() {
  const [projects, setProjects] = useState(() =>
    read<string[]>('projects', []),
  );
  const [collapsed, setCollapsed] = useState(() =>
    read<string[]>('collapsed', []),
  );
  const [threads, render] = useState<Thread[]>([]);
  // Mirrors threads synchronously so IPC events read the latest runs.
  const latest = useRef(threads);
  function setThreads(update: (prev: Thread[]) => Thread[]) {
    latest.current = update(latest.current);
    render(latest.current);
  }
  // Thread keys, which survive a draft's promotion.
  const [activeKey, setActiveKey] = useState<string>();
  const [finishedKey, setFinishedKey] = useState<string>();
  const [error, setError] = useState<string>();
  const [booted, setBooted] = useState(false);
  const [choices, setChoices] = useState<ArchiveChoices>(() =>
    read('archived', {}),
  );
  const [pins, setPins] = useState<Pins>(() => read('pinned', {}));
  const [dragging, setDragging] = useState<boolean | 'new' | 'chat'>(false);
  const sidebarLayout = useDefaultLayout({
    id: 'sidebar',
    storage: localStorage,
  });
  const [permission, setPermission] = useState(
    () => (localStorage.getItem('mode') ?? 'auto') as Permission,
  );
  // Threads whose current run is resolving merge conflicts.
  const resolving = useRef(new Set<string>());
  const runOf = (runId: string) =>
    latest.current.find((t) => t.run?.id === runId);
  const composer = useRef<HTMLTextAreaElement>(null);

  function patch(id: string, update: (thread: Thread) => Thread) {
    setThreads((prev) => prev.map((t) => (t.id === id ? update(t) : t)));
  }

  function patchRun(runId: string, update: (thread: Thread) => Thread) {
    setThreads((prev) =>
      prev.map((t) => (t.run?.id === runId ? update(t) : t)),
    );
  }

  const phase = (runId: string, phase: NonNullable<Thread['run']>['phase']) =>
    patchRun(runId, (t) => ({ ...t, run: { ...t.run!, phase } }));

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
    const thread = runOf(runId);
    if (!thread || !busy(thread)) return;
    // An interrupted turn never reports its subagents ending.
    patchRun(runId, (t) => ({
      ...t,
      run: { ...t.run!, phase: 'idle' },
      permissions: undefined,
      subthreads: t.subthreads?.map((s) =>
        s.state === 'running' ? { ...s, state: 'read' } : s,
      ),
    }));
    setFinishedKey(thread.key);
    const { cwd } = thread;
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

  useEffect(
    () =>
      window.agent.onEvent((runId, event) => {
        const thread = runOf(runId);
        if (!thread) return;
        const { phase: current } = thread.run!;
        if (event.type === 'end') {
          patch(thread.id, (t) =>
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
          return patch(thread.id, (t) => {
            const picked = t.queued?.filter((q) => event.ids.includes(q.uuid));
            if (!picked?.length) return t;
            return {
              ...t,
              queued: t.queued?.filter((q) => !picked.includes(q)),
              items: [...(t.items ?? []), ...picked],
            };
          });
        }
        if (event.type === 'done' && current === 'stopping') {
          patch(thread.id, (t) => ({
            ...t,
            run: { ...t.run!, phase: 'running' },
            status: 'error',
            updatedAt: Date.now(),
            items: [...(t.items ?? []), { type: 'error', message: 'STOPPED' }],
          }));
          return;
        }
        if (event.type === 'state') {
          if (event.state === 'idle') finish(runId);
          if (
            event.state === 'running' &&
            (current === 'idle' || current === 'starting')
          ) {
            phase(runId, 'running');
            setFinishedKey(undefined);
          }
          return;
        }
        if (event.type === 'done' || event.type === 'error') {
          const status = event.type === 'done' && event.ok ? 'done' : 'error';
          patch(thread.id, (t) => ({ ...t, status, updatedAt: Date.now() }));
        }
        if (event.type === 'permission') {
          return patch(thread.id, (t) => ({
            ...t,
            permissions: [...(t.permissions ?? []), event.request],
          }));
        }
        if (event.type === 'answers') {
          return patch(thread.id, (t) => ({
            ...t,
            items: t.items?.map((i) =>
              i.type === 'tool' && i.id === event.id
                ? {
                    ...i,
                    input: { ...(i.input as object), answers: event.answers },
                  }
                : i,
            ),
          }));
        }
        if (event.type === 'context') {
          write('context', {
            ...read('context', {}),
            [thread.id]: event.percentage,
          });
          return patch(thread.id, (t) => ({ ...t, context: event.percentage }));
        }
        if (event.type === 'permission-end') {
          return dropPermission(thread.id, event.id);
        }
        if (event.type === 'subthread') {
          const { id, title } = event;
          return patch(thread.id, (t) => ({
            ...t,
            subthreads: [
              ...(t.subthreads ?? []),
              { id, title, items: [], state: 'running' },
            ],
          }));
        }
        if (event.type === 'subthread-output') {
          return patch(thread.id, (t) => ({
            ...t,
            subthreads: t.subthreads?.map((s) =>
              s.id === event.id
                ? { ...s, items: [...s.items, event.output] }
                : s,
            ),
          }));
        }
        if (event.type === 'subthread-end') {
          return patch(thread.id, (t) => ({
            ...t,
            subthreads: t.subthreads?.map((s) =>
              s.id === event.id
                ? { ...s, state: event.ok ? 'done' : 'error' }
                : s,
            ),
          }));
        }
        if (event.type !== 'session') return append(thread.id, event);
        if (!thread.draft) return;
        // A draft becomes a real thread once Claude assigns its session id.
        patch(thread.id, (t) => ({
          ...t,
          id: event.sessionId,
          draft: undefined,
        }));
      }),
    [],
  );

  const visible = threads
    .filter((t) => projects.includes(t.cwd))
    .toSorted((a, b) => b.createdAt - a.createdAt);
  const { current, archived } = listThreads(visible, choices, pins, activeKey);
  const active =
    visible.find((t) => t.key === activeKey) ?? current[0] ?? visible[0];
  // Async work like a merge finishes after the render that started it.
  const view = useRef({ active, current });
  view.current = { active, current };

  function choose(id: string, value: true | number | undefined) {
    setChoices((prev) => {
      const { [id]: _, ...next } = prev;
      if (value !== undefined) next[id] = value;
      write('archived', next);
      return next;
    });
  }

  function pin(id: string, value: boolean) {
    setPins((prev) => {
      const { [id]: _, ...next } = prev;
      if (value) next[id] = Date.now();
      write('pinned', next);
      return next;
    });
  }

  function send(prompt: string, images: Image[], choice: ModelChoice) {
    if (!active) return;
    setError(undefined);
    const { id, cwd, draft, isolated, worktree, run } = latest.current.find(
      (t) => t.key === active.key,
    )!;
    const uuid = crypto.randomUUID();
    const message = {
      type: 'user' as const,
      text: prompt,
      ...(images.length > 0 && { images }),
    };
    const runId = run?.id ?? crypto.randomUUID();
    const queue = run && run.phase !== 'idle';
    const dir =
      run?.dir ??
      (isolated && !worktree
        ? window.agent
            .createWorktree(
              cwd,
              id.slice(0, 8),
              read<Record<string, string>>('setup', {})[cwd] || undefined,
            )
            .then(({ path, branch, setup }) => {
              patch(id, (t) => ({ ...t, worktree: path, branch }));
              if (setup)
                append(id, {
                  type: 'tool',
                  id: crypto.randomUUID(),
                  name: 'Setup',
                  input: { command: setup.command },
                });
              if (setup && !setup.ok)
                append(id, {
                  type: 'error',
                  message: `Setup failed\n${setup.output}`,
                });
              return path;
            })
        : Promise.resolve(worktree ?? cwd));
    patch(id, (t) => ({
      ...t,
      title:
        t.draft && t.items?.length === 0 && prompt
          ? prompt.slice(0, 48)
          : t.title,
      status: undefined,
      updatedAt: Date.now(),
      images: undefined,
      run: { id: runId, dir, phase: queue ? run.phase : 'starting' },
      ...(queue
        ? { queued: [...(t.queued ?? []), { ...message, uuid }] }
        : { items: [...(t.items ?? []), message] }),
    }));
    setFinishedKey(undefined);
    dir
      .then((d) => {
        // A stop while the worktree was being created cancels the message.
        const t = runOf(runId);
        if (
          queue
            ? t?.queued?.some((q) => q.uuid === uuid)
            : t?.run?.phase !== 'stopping'
        )
          return window.agent.send(
            runId,
            prompt,
            images,
            d,
            draft ? undefined : id,
            choice,
            permission,
            uuid,
          );
        if (queue) return;
        patchRun(runId, (t) => ({
          ...t,
          status: 'error',
          updatedAt: Date.now(),
          items: [...(t.items ?? []), { type: 'error', message: 'STOPPED' }],
        }));
        finish(runId);
      })
      .catch((err) => {
        report(runOf(runId)!.id)(err);
        if (queue)
          return patchRun(runId, (t) => ({
            ...t,
            queued: t.queued?.filter((q) => q.uuid !== uuid),
          }));
        // A failed worktree is retried on the next send.
        patchRun(runId, (t) => ({ ...t, run: { ...t.run!, dir: undefined } }));
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
    setActiveKey(thread.key);
    setFinishedKey(undefined);
    setError(undefined);
    if (thread.items) return;
    window.agent.loadThread(thread.id, thread.worktree ?? thread.cwd).then(
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

  function create(prompt?: string, cwd = active?.cwd) {
    if (!cwd) return;
    if (collapsed.includes(cwd)) toggle(cwd);
    const empty = visible.find(
      (t) =>
        t.cwd === cwd &&
        t.draft &&
        t.items?.length === 0 &&
        !t.prompt?.trim() &&
        !t.images?.length,
    );
    if (empty) {
      if (prompt !== undefined) patch(empty.id, (t) => ({ ...t, prompt }));
      select(empty);
      composer.current?.focus();
      return;
    }
    const thread = newThread(cwd);
    setThreads((prev) => [{ ...thread, prompt }, ...prev]);
    select(thread);
  }

  const entryText = (e: DragEvent) =>
    e.dataTransfer.types.includes(backlogType)
      ? e.dataTransfer.getData('text/plain')
      : undefined;

  function caretToEnd(text: string) {
    composer.current?.focus();
    composer.current?.setSelectionRange(text.length, text.length);
  }

  async function remove(id: string) {
    const thread = latest.current.find((t) => t.id === id)!;
    if (busy(thread)) return;
    setError(undefined);
    if (thread.run) await window.agent.close(thread.run.id);
    if (!thread.draft) {
      try {
        await window.agent.deleteThread(id, thread.cwd, thread.worktree);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
    }
    setThreads((prev) => prev.filter((t) => t.id !== id));
    choose(id, undefined);
    pin(id, false);
    const { [id]: _, ...context } = read<Record<string, number>>('context', {});
    write('context', context);
    if (view.current.active?.key !== thread.key) return;
    const siblings = view.current.current.filter((t) => t.cwd === thread.cwd);
    const i = siblings.findIndex((t) => t.key === thread.key);
    const next = siblings[i + 1] ?? siblings[i - 1];
    if (next) return select(next);
    const fresh = newThread(thread.cwd);
    setThreads((prev) => [fresh, ...prev]);
    select(fresh);
  }

  async function mergeWorktree(thread: Thread) {
    try {
      await window.agent.mergeWorktree(
        thread.cwd,
        thread.worktree!,
        thread.title,
      );
    } catch (err) {
      report(thread.id)(err);
      if (String(err).includes('CONFLICT'))
        patch(thread.id, (t) => ({ ...t, conflict: true }));
      return;
    }
    await remove(thread.id);
  }

  async function resolveConflict(thread: Thread) {
    const base = await window.agent.branch(thread.cwd);
    patch(thread.id, (t) => ({ ...t, conflict: undefined }));
    resolving.current.add(thread.id);
    send(
      `Merging this worktree into ${base} hit conflicts. Merge ${base} into this branch, resolve the conflicts keeping the intent of both sides, run the tests, and commit the merge.`,
      [],
      read('model', DEFAULT_MODEL),
    );
  }

  // Retries the merge once the agent resolving its conflicts finishes cleanly.
  useEffect(() => {
    const thread = visible.find((t) => t.key === finishedKey);
    if (
      thread &&
      resolving.current.delete(thread.id) &&
      thread.status === 'done'
    )
      mergeWorktree(thread);
  }, [finishedKey]);

  function saveProjects(update: (prev: string[]) => string[]) {
    setProjects((prev) => {
      const next = update(prev);
      write('projects', next);
      return next;
    });
  }

  function toggle(cwd: string) {
    setCollapsed((prev) => {
      const next = prev.includes(cwd)
        ? prev.filter((p) => p !== cwd)
        : [...prev, cwd];
      write('collapsed', next);
      return next;
    });
  }

  async function load(cwd: string) {
    const list = await window.agent.listThreads(cwd);
    const mine = merge(
      latest.current.filter((t) => t.cwd === cwd),
      cwd,
      list,
    );
    const loaded = mine.length ? mine : [newThread(cwd)];
    setThreads((prev) => [...prev.filter((t) => t.cwd !== cwd), ...loaded]);
    return loaded;
  }

  async function openProject() {
    setError(undefined);
    const cwd = await window.agent.pickWorkspace();
    if (!cwd) return;
    if (!projects.includes(cwd) && projects.length >= MAX_PROJECTS)
      return setError('Close a project to open another');
    const loaded = await load(cwd);
    saveProjects((prev) => (prev.includes(cwd) ? prev : [...prev, cwd]));
    if (collapsed.includes(cwd)) toggle(cwd);
    select(loaded[0]);
  }

  function closeProject(cwd: string) {
    setError(undefined);
    saveProjects((prev) => prev.filter((p) => p !== cwd));
    window.terminal.close(cwd);
    for (const t of latest.current) {
      if (t.cwd === cwd && t.run?.phase === 'idle')
        window.agent.close(t.run.id).catch(report(t.id));
    }
    const next = [...current, ...archived].find((t) => t.cwd !== cwd);
    if (active?.cwd === cwd && next) select(next);
  }

  // Reopens the saved projects, plus the folder zephyr was launched with.
  useEffect(() => {
    const launched = new URLSearchParams(location.search).get('workspace');
    const dirs = [
      ...new Set([...projects, ...(launched ? [launched] : [])]),
    ].slice(-MAX_PROJECTS);
    saveProjects(() => dirs);
    Promise.all(dirs.map((cwd) => load(cwd).catch(() => []))).then((loaded) => {
      const first = loaded[launched ? dirs.indexOf(launched) : 0]?.[0];
      if (first) select(first);
      setBooted(true);
    });
  }, []);

  // Blank until saved projects load, so the open folder screen doesn't flash.
  if (!active && !booted) return <main className="h-screen bg-void" />;

  if (!active) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-8 bg-void text-ink">
        <div className="flex flex-col items-center gap-2">
          <h1 className="indent-[0.3em] text-5xl font-medium tracking-[0.3em]">
            ZEPHYR
          </h1>
          {import.meta.env.DEV && (
            <span className="indent-[0.1em] text-2xs tracking-widest text-mute">
              DEV
            </span>
          )}
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={openProject}
          className="chamfer"
        >
          [ OPEN FOLDER ]
        </Button>
      </main>
    );
  }

  return (
    <main className="h-screen bg-void text-ink">
      <Group
        defaultLayout={sidebarLayout.defaultLayout}
        onLayoutChanged={sidebarLayout.onLayoutChanged}
      >
        <Panel
          id="sidebar"
          minSize={200}
          maxSize={480}
          defaultSize={240}
          groupResizeBehavior="preserve-pixel-size"
          className="relative flex"
        >
          <Sidebar
            workspace={active.cwd}
            projects={projects}
            collapsed={collapsed}
            onToggle={toggle}
            onOpenProject={openProject}
            onCloseProject={closeProject}
            current={current}
            archived={archived}
            onArchive={(id, value) => {
              choose(id, value || Date.now());
              if (value) pin(id, false);
            }}
            pinned={pins}
            onPin={pin}
            activeId={active.id}
            onSelect={(id) => select(visible.find((t) => t.id === id)!)}
            onNew={(cwd) => create(undefined, cwd)}
            onDelete={remove}
            error={error}
            permission={permission}
            onPermission={(next) => {
              setPermission(next);
              localStorage.setItem('mode', next);
              for (const t of latest.current) {
                if (t.run)
                  window.agent
                    .setPermission(t.run.id, next)
                    .catch(report(t.id));
              }
            }}
          />
          {dragging && (
            <div
              data-over={dragging === 'new' || undefined}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(backlogType)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                setDragging('new');
              }}
              onDragLeave={() => setDragging(true)}
              onDrop={(e) => {
                const text = entryText(e);
                if (text === undefined) return;
                e.preventDefault();
                flushSync(() => create(text));
                caretToEnd(text);
              }}
              className="absolute inset-0 z-10 flex items-center justify-center border border-line-strong bg-panel text-2xs tracking-widest text-mute transition-colors duration-150 ease-mech data-over:bg-paper data-over:text-void"
            >
              [ + NEW THREAD ]
            </div>
          )}
        </Panel>
        <Separator className="relative z-10 w-px bg-line transition-colors duration-150 ease-mech before:absolute before:inset-y-0 before:-inset-x-1 hover:bg-line-strong data-[separator=active]:bg-line-strong" />
        <Panel id="main" className="flex">
          <Backlog cwd={active.cwd} onDragging={setDragging}>
            <div
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(backlogType)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                setDragging('chat');
              }}
              onDragLeave={(e) =>
                !e.currentTarget.contains(e.relatedTarget as Node) &&
                setDragging((d) => d && true)
              }
              onDrop={(e) => {
                const text = entryText(e);
                if (text === undefined) return;
                e.preventDefault();
                const prompt = active.prompt?.trimEnd();
                const next = prompt ? `${prompt}\n${text}` : text;
                flushSync(() =>
                  patch(active.id, (t) => ({ ...t, prompt: next })),
                );
                caretToEnd(next);
              }}
              className="relative flex min-w-0 flex-1"
            >
              {dragging && (
                <div
                  data-over={dragging === 'chat' || undefined}
                  className="group pointer-events-none absolute inset-2 z-10 flex items-center justify-center border border-line-strong transition-colors duration-150 ease-mech data-over:border-ink"
                >
                  <span className="border border-line-strong bg-panel px-3 py-1 text-2xs tracking-widest text-mute transition-colors duration-150 ease-mech group-data-over:border-paper group-data-over:bg-paper group-data-over:text-void">
                    [ + ADD TO PROMPT ]
                  </span>
                </div>
              )}
              <ChatThread
                key={active.key}
                thread={active}
                running={busy(active)}
                justFinished={finishedKey === active.key}
                onSend={send}
                onPrompt={(prompt) =>
                  patch(active.id, (t) => ({ ...t, prompt }))
                }
                onMerge={() => mergeWorktree(active)}
                onResolve={() => resolveConflict(active)}
                onIsolate={(isolated) =>
                  patch(active.id, (t) => ({
                    ...t,
                    isolated: isolated || undefined,
                  }))
                }
                onImages={(update) =>
                  patch(active.id, (t) => ({
                    ...t,
                    images: update(t.images ?? []),
                  }))
                }
                onCancel={() => {
                  const { run } = active;
                  if (!run) return;
                  if (busy(active)) phase(run.id, 'stopping');
                  patch(active.id, (t) => ({ ...t, queued: undefined }));
                  window.agent.interrupt(run.id).catch(report(active.id));
                }}
                onAnswer={(id, allow, answers) => {
                  dropPermission(active.id, id);
                  window.agent
                    .answerPermission(active.run!.id, id, allow, answers)
                    .catch(report(active.id));
                }}
                composer={composer}
              />
            </div>
          </Backlog>
        </Panel>
      </Group>
    </main>
  );
}
