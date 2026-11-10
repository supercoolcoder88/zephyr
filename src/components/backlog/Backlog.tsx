import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import { GripVertical, ListTodo } from 'lucide-react';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
} from 'react-resizable-panels';
import type { BacklogEntry, BacklogEdit } from '../../agent-types';
import TerminalDialog from '../terminal/TerminalDialog';
import Button from '../ui/Button';

export const backlogType = 'application/x-zephyr-backlog';

interface Props {
  cwd: string;
  onDragging(dragging: boolean): void;
  children: ReactNode;
}

const message = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

const sideOf = (e: DragEvent) => {
  const box = e.currentTarget.getBoundingClientRect();
  return e.clientY < box.top + box.height / 2 ? 'before' : 'after';
};

const icon = {
  size: 14,
  strokeWidth: 1.5,
  strokeLinecap: 'square',
  strokeLinejoin: 'miter',
  'aria-hidden': true,
} as const;

export default function Backlog({ cwd, onDragging, children }: Props) {
  // Tagged with their project so a reply that lands after a switch is ignored.
  const [list, setList] = useState<{ cwd: string; entries: BacklogEntry[] }>();
  const [error, setError] = useState<string>();
  const [snapping, setSnapping] = useState(false);
  const snap = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState<string>();
  const [showDone, setShowDone] = useState(false);
  const [terminal, setTerminal] = useState(false);
  // The workspace whose shell this window started, so it can offer to kill it.
  const [shell, setShell] = useState<string>();
  if (terminal && shell !== cwd) setShell(cwd);
  const [dragKey, setDragKey] = useState<string>();
  const [over, setOver] = useState<{ key: string; side: 'before' | 'after' }>();
  const press = useRef({ x: 0, y: 0 });
  const panel = usePanelRef();
  const layout = useDefaultLayout({ id: 'backlog', storage: localStorage });
  const [open, setOpen] = useState(
    () => (layout.defaultLayout?.backlog ?? 1) > 0,
  );
  const entries = list?.cwd === cwd ? list.entries : [];
  const seen = new Map<string, number>();
  const pending = entries.filter((t) => !t.done);
  const done = entries.filter((t) => t.done);
  const rows = [...pending, ...(showDone ? done : [])].map((entry) => {
    const n = seen.get(entry.text) ?? 0;
    seen.set(entry.text, n + 1);
    return { entry, key: `${n}:${entry.text}` };
  });
  const doneToggle = done.length > 0 && (
    <li>
      <Button
        size="md"
        aria-expanded={showDone}
        onClick={() => setShowDone(!showDone)}
        className="mt-2 w-full hover:bg-line"
      >
        {showDone ? '[ HIDE DONE ]' : `[ DONE ${done.length} ]`}
      </Button>
    </li>
  );
  const dragged = rows.find((r) => r.key === dragKey)?.entry;
  const lost = dragKey !== undefined && !dragged;

  useEffect(() => {
    setError(undefined);
    window.backlog.watch(cwd).then(
      (entries) => setList({ cwd, entries }),
      (err) => setError(message(err)),
    );
    return window.backlog.onChange(
      (from, entries) => from === cwd && setList({ cwd, entries }),
    );
  }, [cwd]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 't') return;
      e.preventDefault();
      toggle();
    };
    // Captured so the terminal never receives its own toggle.
    const onTerminalKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.code !== 'Backquote') return;
      e.preventDefault();
      e.stopPropagation();
      setTerminal((open) => !open);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onTerminalKey, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onTerminalKey, true);
    };
  }, []);

  useEffect(
    () =>
      window.terminal.onExit((from) => {
        if (from !== cwd) return;
        setTerminal(false);
        setShell(undefined);
      }),
    [cwd],
  );

  useEffect(() => () => clearTimeout(snap.current), []);

  // A source row removed mid-drag fires its dragend detached, where window never sees it.
  useEffect(() => {
    if (dragKey === undefined) return;
    const end = () => {
      setDragKey(undefined);
      setOver(undefined);
      onDragging(false);
    };
    if (lost) return end();
    window.addEventListener('dragend', end);
    window.addEventListener('drop', end);
    return () => {
      window.removeEventListener('dragend', end);
      window.removeEventListener('drop', end);
    };
  }, [dragKey, lost, onDragging]);

  function edit(change: BacklogEdit) {
    setError(undefined);
    window.backlog.edit(cwd, change).then(
      (entries) => setList({ cwd, entries }),
      (err) => setError(message(err)),
    );
  }

  function toggle() {
    setSnapping(true);
    clearTimeout(snap.current);
    snap.current = setTimeout(() => setSnapping(false), 200);
    if (panel.current?.isCollapsed()) panel.current.expand();
    else panel.current?.collapse();
  }

  return (
    <Group
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
      data-snap={snapping || undefined}
      className="min-w-0 flex-1 data-snap:*:data-panel:transition-[flex-grow] data-snap:*:data-panel:duration-200 data-snap:*:data-panel:ease-mech"
    >
      <Panel id="main" minSize={320} className="flex">
        {children}
      </Panel>
      <Separator
        disableDoubleClick
        onPointerDown={(e) => (press.current = { x: e.clientX, y: e.clientY })}
        onClick={(e) => {
          // Keyboard clicks on the button have no detail; a pointer that moved was resizing.
          const { x, y } = press.current;
          if (e.detail && Math.hypot(e.clientX - x, e.clientY - y) > 4) return;
          toggle();
        }}
        className="group relative flex w-6 cursor-pointer flex-col items-center before:absolute before:inset-x-0 before:top-0 before:h-12 before:border-b before:border-line"
      >
        <span className="w-px flex-1 bg-line transition-colors duration-150 ease-mech group-hover:bg-line-strong group-data-[separator=active]:bg-line-strong" />
        <button
          type="button"
          aria-label={open ? 'Hide backlog' : 'Show backlog'}
          aria-expanded={open}
          aria-controls="backlog"
          title={`Toggle backlog (${/Mac/.test(navigator.userAgent) ? '⌘T' : 'Ctrl+T'})`}
          className="flex size-6 shrink-0 items-center justify-center border border-line text-mute transition-colors duration-150 ease-mech group-hover:border-line-strong hover:text-ink aria-expanded:text-ink"
        >
          <ListTodo {...icon} />
        </button>
        <span className="w-px flex-1 bg-line transition-colors duration-150 ease-mech group-hover:bg-line-strong group-data-[separator=active]:bg-line-strong" />
      </Separator>
      <Panel
        id="backlog"
        panelRef={panel}
        collapsible
        minSize={224}
        maxSize="50%"
        defaultSize={280}
        groupResizeBehavior="preserve-pixel-size"
        onResize={(size) => setOpen(size.inPixels > 0)}
        style={{ overflow: 'hidden' }}
        className="bg-panel"
      >
        <section className="flex h-full min-w-56 flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
            <h2 className="text-2xs tracking-widest uppercase">Backlog</h2>
            {entries.length > 0 && (
              <span className="text-2xs tracking-widest text-mute">
                {String(done.length).padStart(2, '0')}/
                {String(entries.length).padStart(2, '0')}
              </span>
            )}
          </header>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              edit({ type: 'add', text: draft });
              setDraft('');
            }}
            className="border-b border-line"
          >
            <input
              aria-label="New backlog entry"
              placeholder="+ ADD"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-10 w-full bg-transparent px-4 text-sm outline-none placeholder:text-2xs placeholder:tracking-widest placeholder:text-mute"
            />
          </form>
          <ul
            onDragLeave={(e) =>
              !e.currentTarget.contains(e.relatedTarget as Node) &&
              setOver(undefined)
            }
            className="flex-1 overflow-y-auto py-2"
          >
            {entries.length === 0 && (
              <li className="px-4 py-1 text-2xs tracking-widest text-mute">
                EMPTY
              </li>
            )}
            {rows.map(({ entry, key }, i) => (
              <Fragment key={key}>
                {i === pending.length && doneToggle}
                <li
                  draggable={renaming !== key}
                  data-dragging={dragKey === key || undefined}
                  data-drop={over?.key === key ? over.side : undefined}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(backlogType, JSON.stringify(entry));
                    e.dataTransfer.setData('text/plain', entry.text);
                    e.dataTransfer.effectAllowed = 'copyMove';
                    setDragKey(key);
                    onDragging(true);
                  }}
                  onDragOver={(e) => {
                    if (dragged?.done !== entry.done) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const side = sideOf(e);
                    if (over?.key !== key || over.side !== side)
                      setOver({ key, side });
                  }}
                  onDrop={(e) => {
                    if (!dragged || dragged.done !== entry.done) return;
                    e.preventDefault();
                    const next = rows[i + 1]?.entry;
                    const before =
                      sideOf(e) === 'before'
                        ? entry
                        : next?.done === entry.done
                          ? next
                          : undefined;
                    edit({ type: 'move', entry: dragged, before });
                  }}
                  className="group relative flex cursor-grab items-start gap-2 px-4 py-1 text-sm before:absolute before:inset-x-0 before:hidden before:h-px before:bg-ink hover:bg-line active:cursor-grabbing data-dragging:opacity-50 data-drop:before:block data-[drop=after]:before:bottom-0 data-[drop=before]:before:top-0"
                >
                  <GripVertical
                    {...icon}
                    className="invisible absolute top-1.75 left-0.5 text-mute group-hover:visible"
                  />
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={entry.done}
                    aria-label={entry.text}
                    onClick={() => edit({ type: 'toggle', entry })}
                    className="peer shrink-0 text-mute transition-colors duration-150 ease-mech hover:text-ink aria-checked:text-ink"
                  >
                    {entry.done ? '[x]' : '[ ]'}
                  </button>
                  {renaming === key ? (
                    <textarea
                      aria-label={`Rename ${entry.text}`}
                      defaultValue={entry.text}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Escape')
                          e.currentTarget.value = entry.text;
                        if (e.key === 'Enter' || e.key === 'Escape') {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                      }}
                      onBlur={(e) => {
                        setRenaming(undefined);
                        const text = e.currentTarget.value;
                        if (text.trim() && text !== entry.text)
                          edit({ type: 'rename', entry, text });
                      }}
                      className="field-sizing-content min-w-0 flex-1 resize-none bg-transparent outline-none"
                    />
                  ) : (
                    <span
                      onDoubleClick={() => setRenaming(key)}
                      className="min-w-0 flex-1 cursor-text break-words select-text peer-aria-checked:text-mute peer-aria-checked:line-through"
                    >
                      {entry.text}
                    </span>
                  )}
                  <Button
                    variant="destructive"
                    aria-label={`Delete ${entry.text}`}
                    onClick={() => edit({ type: 'remove', entry })}
                    className="invisible shrink-0 leading-5 group-focus-within:visible group-hover:visible"
                  >
                    [ X ]
                  </Button>
                </li>
              </Fragment>
            ))}
            {rows.length === pending.length && doneToggle}
          </ul>
          {error && <p className="px-4 py-2 text-2xs text-alert">{error}</p>}
          <div className="flex shrink-0 border-t border-line">
            <Button
              size="lg"
              aria-expanded={terminal}
              title="Toggle terminal (Ctrl+`)"
              onClick={() => setTerminal(true)}
              className="flex-1 hover:bg-line"
            >
              [ TERMINAL ]
            </Button>
            {shell === cwd && (
              <Button
                size="lg"
                variant="destructive"
                aria-label="Kill terminal"
                title="Kill terminal"
                onClick={() => window.terminal.close(cwd)}
              >
                [ X ]
              </Button>
            )}
          </div>
        </section>
      </Panel>
      {terminal && (
        <TerminalDialog
          key={cwd}
          cwd={cwd}
          onClose={() => setTerminal(false)}
        />
      )}
    </Group>
  );
}
