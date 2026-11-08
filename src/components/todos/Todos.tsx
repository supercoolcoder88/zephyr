import {
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
import type { Todo, TodoEdit } from '../../agent-types';
import Button from '../ui/Button';

export const todoType = 'application/x-zephyr-todo';

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

export default function Todos({ cwd, onDragging, children }: Props) {
  // Tagged with their project so a reply that lands after a switch is ignored.
  const [list, setList] = useState<{ cwd: string; todos: Todo[] }>();
  const [error, setError] = useState<string>();
  const [snapping, setSnapping] = useState(false);
  const snap = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState<string>();
  const [dragKey, setDragKey] = useState<string>();
  const [over, setOver] = useState<{ key: string; side: 'before' | 'after' }>();
  const press = useRef({ x: 0, y: 0 });
  const panel = usePanelRef();
  const layout = useDefaultLayout({ id: 'todos', storage: localStorage });
  const [open, setOpen] = useState(
    () => (layout.defaultLayout?.todos ?? 1) > 0,
  );
  const todos = list?.cwd === cwd ? list.todos : [];
  const seen = new Map<string, number>();
  const rows = [
    ...todos.filter((t) => !t.done),
    ...todos.filter((t) => t.done),
  ].map((todo) => {
    const n = seen.get(todo.text) ?? 0;
    seen.set(todo.text, n + 1);
    return { todo, key: `${n}:${todo.text}` };
  });
  const dragged = rows.find((r) => r.key === dragKey)?.todo;
  const lost = dragKey !== undefined && !dragged;

  useEffect(() => {
    setError(undefined);
    window.todos.watch(cwd).then(
      (todos) => setList({ cwd, todos }),
      (err) => setError(message(err)),
    );
    return window.todos.onChange(
      (from, todos) => from === cwd && setList({ cwd, todos }),
    );
  }, [cwd]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 't') return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  function edit(change: TodoEdit) {
    setError(undefined);
    window.todos.edit(cwd, change).then(
      (todos) => setList({ cwd, todos }),
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
        className="group flex w-6 cursor-pointer flex-col items-center"
      >
        <span className="w-px flex-1 bg-line transition-colors duration-150 ease-mech group-hover:bg-line-strong group-data-[separator=active]:bg-line-strong" />
        <button
          type="button"
          aria-label={open ? 'Hide todos' : 'Show todos'}
          aria-expanded={open}
          aria-controls="todos"
          title={`Toggle todos (${/Mac/.test(navigator.userAgent) ? '⌘T' : 'Ctrl+T'})`}
          className="flex size-6 shrink-0 items-center justify-center border border-line text-mute transition-colors duration-150 ease-mech group-hover:border-line-strong hover:text-ink aria-expanded:text-ink"
        >
          <ListTodo {...icon} />
        </button>
        <span className="w-px flex-1 bg-line transition-colors duration-150 ease-mech group-hover:bg-line-strong group-data-[separator=active]:bg-line-strong" />
      </Separator>
      <Panel
        id="todos"
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
            <h2 className="text-2xs tracking-widest uppercase">Todo</h2>
            {todos.length > 0 && (
              <span className="text-2xs tracking-widest text-mute">
                {String(todos.filter((t) => t.done).length).padStart(2, '0')}/
                {String(todos.length).padStart(2, '0')}
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
              aria-label="New todo"
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
            {rows.length === 0 && (
              <li className="px-4 py-1 text-2xs tracking-widest text-mute">
                NO TODOS
              </li>
            )}
            {rows.map(({ todo, key }, i) => (
              <li
                key={key}
                draggable={renaming !== key}
                data-dragging={dragKey === key || undefined}
                data-drop={over?.key === key ? over.side : undefined}
                onDragStart={(e) => {
                  e.dataTransfer.setData(todoType, JSON.stringify(todo));
                  e.dataTransfer.setData('text/plain', todo.text);
                  e.dataTransfer.effectAllowed = 'copyMove';
                  setDragKey(key);
                  onDragging(true);
                }}
                onDragOver={(e) => {
                  if (dragged?.done !== todo.done) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  const side = sideOf(e);
                  if (over?.key !== key || over.side !== side)
                    setOver({ key, side });
                }}
                onDrop={(e) => {
                  if (!dragged || dragged.done !== todo.done) return;
                  e.preventDefault();
                  const next = rows[i + 1]?.todo;
                  const before =
                    sideOf(e) === 'before'
                      ? todo
                      : next?.done === todo.done
                        ? next
                        : undefined;
                  edit({ type: 'move', todo: dragged, before });
                }}
                className="group relative flex cursor-grab items-start gap-2 px-4 py-1 text-sm before:absolute before:inset-x-0 before:hidden before:h-px before:bg-ink hover:bg-line active:cursor-grabbing data-dragging:opacity-50 data-drop:before:block data-[drop=after]:before:bottom-0 data-[drop=before]:before:top-0"
              >
                <GripVertical
                  {...icon}
                  className="invisible absolute top-1.5 left-0.5 text-mute group-hover:visible"
                />
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={todo.done}
                  aria-label={todo.text}
                  onClick={() => edit({ type: 'toggle', todo })}
                  className="peer shrink-0 text-mute transition-colors duration-150 ease-mech hover:text-ink aria-checked:text-ink"
                >
                  {todo.done ? '[x]' : '[ ]'}
                </button>
                {renaming === key ? (
                  <input
                    aria-label={`Rename ${todo.text}`}
                    defaultValue={todo.text}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') e.currentTarget.value = todo.text;
                      if (e.key === 'Enter' || e.key === 'Escape')
                        e.currentTarget.blur();
                    }}
                    onBlur={(e) => {
                      setRenaming(undefined);
                      const text = e.currentTarget.value;
                      if (text.trim() && text !== todo.text)
                        edit({ type: 'rename', todo, text });
                    }}
                    className="min-w-0 flex-1 bg-transparent outline-none"
                  />
                ) : (
                  <span
                    onDoubleClick={() => setRenaming(key)}
                    className="min-w-0 flex-1 cursor-text break-words peer-aria-checked:text-mute peer-aria-checked:line-through"
                  >
                    {todo.text}
                  </span>
                )}
                <Button
                  variant="destructive"
                  aria-label={`Delete ${todo.text}`}
                  onClick={() => edit({ type: 'remove', todo })}
                  className="invisible shrink-0 self-center group-focus-within:visible group-hover:visible"
                >
                  [ X ]
                </Button>
              </li>
            ))}
          </ul>
          {error && <p className="px-4 py-2 text-2xs text-alert">{error}</p>}
        </section>
      </Panel>
    </Group>
  );
}
