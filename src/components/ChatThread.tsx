import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type Ref,
} from 'react';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import type { SlashCommand, ThreadItem } from '../agent-types';
import type { Thread } from '../thread';

// Listing commands spawns a CLI, so do it once per workspace.
const commandLists = new Map<string, Promise<SlashCommand[]>>();

interface Props {
  thread: Thread;
  running: boolean;
  justFinished: boolean;
  onSend(prompt: string): void;
  onCancel(): void;
  composer: Ref<HTMLTextAreaElement>;
}

export default function ChatThread({
  thread,
  running,
  justFinished,
  onSend,
  onCancel,
  composer,
}: Props) {
  const [prompt, setPrompt] = useState('');
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [selected, setSelected] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // Follow new output only while the user is at the bottom.
  const pinned = useRef(true);
  const menu = useRef<HTMLUListElement>(null);
  const [expanded, setExpanded] = useState<number[]>([]);
  const items = thread.items ?? [];
  const turns = groupTurns(items);

  const typed = /^\/(\S*)$/.exec(prompt)?.[1].toLowerCase();
  const matches =
    typed === undefined || dismissed
      ? []
      : [
          ...commands.filter((c) => c.name.toLowerCase().startsWith(typed)),
          ...commands.filter(
            (c) =>
              !c.name.toLowerCase().startsWith(typed) &&
              c.name.toLowerCase().includes(typed),
          ),
        ];
  const highlighted = Math.min(selected, matches.length - 1);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  useEffect(() => {
    let list = commandLists.get(thread.cwd);
    if (!list) {
      list = window.agent.commands(thread.cwd);
      commandLists.set(thread.cwd, list);
      list.catch(() => commandLists.delete(thread.cwd));
    }
    let live = true;
    list.then((c) => live && setCommands(c)).catch(() => {});
    return () => {
      live = false;
    };
  }, [thread.cwd]);

  useEffect(() => {
    menu.current?.children[highlighted]?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  function edit(text: string) {
    setPrompt(text);
    setSelected(0);
    setDismissed(false);
  }

  function send(text: string) {
    if (!text.trim() || running) return;
    onSend(text);
    pinned.current = true;
    edit('');
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    send(prompt);
  }

  // Commands that take arguments are completed; the rest run straight away.
  function pick(command: SlashCommand, run: boolean) {
    if (run && !command.argumentHint) return send(`/${command.name}`);
    edit(`/${command.name} `);
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-6">
        <h1 className="truncate text-2xs tracking-widest uppercase">
          {thread.title}
        </h1>
        <span
          className={`text-2xs tracking-widest ${running ? 'text-cyan' : 'text-mute'}`}
        >
          {running ? 'RUNNING' : 'IDLE'}
        </span>
      </header>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6 py-6"
      >
        {turns.length === 0 ? (
          <p className="pt-24 text-center text-2xs tracking-widest text-mute">
            NO MESSAGES YET
          </p>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {turns.map((turn, t) => {
              const last = t === turns.length - 1;
              const collapsed = !(running && last);
              const lastTool = turn.findLastIndex((i) => i.type === 'tool');
              let afterAgent = false;
              const kept = turn.map((item, i) => {
                if (item.type !== 'tool')
                  return item.type !== 'text' || i > lastTool || afterAgent;
                afterAgent = item.name === 'Agent' || item.name === 'Task';
                return false;
              });
              const hidden = collapsed ? kept.filter((k) => !k).length : 0;
              const open = expanded.includes(t);
              return (
                <div
                  key={t}
                  className={`space-y-2 ${last && justFinished ? 'flash' : ''}`}
                >
                  {turn.map(
                    (item, i) =>
                      (!hidden || open || kept[i]) && (
                        <Item
                          key={i}
                          item={item}
                          live={running && last && i === turn.length - 1}
                        />
                      ),
                  )}
                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded(
                          open
                            ? expanded.filter((e) => e !== t)
                            : [...expanded, t],
                        )
                      }
                      className="ml-auto block text-2xs tracking-widest text-mute transition-colors duration-150 ease-mech hover:text-ink"
                    >
                      {open ? '[ HIDE ]' : `[ ${hidden} HIDDEN ]`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <form
        onSubmit={submit}
        className={`relative flex shrink-0 items-end gap-2 border-t border-line bg-panel p-3 ${running ? 'scanline' : ''}`}
      >
        {matches.length > 0 && (
          <ul
            ref={menu}
            role="listbox"
            className="absolute right-0 bottom-full left-0 max-h-64 overflow-y-auto border-t border-line bg-panel py-1"
          >
            {matches.map((c, i) => (
              <li
                key={c.name}
                role="option"
                aria-selected={i === highlighted}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setSelected(i)}
                onClick={() => pick(c, true)}
                className={`flex cursor-pointer gap-3 px-3 py-1 text-sm ${
                  i === highlighted ? 'bg-paper text-void' : ''
                }`}
              >
                <span className="shrink-0">
                  /{c.name}
                  {c.argumentHint && (
                    <span className="text-mute"> {c.argumentHint}</span>
                  )}
                </span>
                <span className="min-w-0 truncate text-mute">
                  {c.description}
                </span>
              </li>
            ))}
          </ul>
        )}
        <textarea
          ref={composer}
          autoFocus
          rows={1}
          value={prompt}
          onChange={(e) => edit(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (matches.length > 0) {
              const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
              if (step) {
                e.preventDefault();
                const n = matches.length;
                return setSelected((highlighted + step + n) % n);
              }
              if (e.key === 'Escape') return setDismissed(true);
              if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault();
                return pick(matches[highlighted], e.key === 'Enter');
              }
            }
            if (e.key !== 'Enter' || e.shiftKey) return;
            e.preventDefault();
            submit();
          }}
          placeholder="Ask the agent…"
          className="max-h-48 min-w-0 flex-1 resize-none border border-line bg-void px-3 py-2 text-sm [field-sizing:content] outline-none placeholder:text-mute focus:border-line-strong"
        />
        {running ? (
          <button
            type="button"
            onClick={onCancel}
            className="h-[38px] border border-alert px-4 text-2xs tracking-widest text-alert transition-colors duration-150 ease-mech hover:bg-alert hover:text-void"
          >
            [ STOP ]
          </button>
        ) : (
          <button
            type="submit"
            disabled={!prompt.trim()}
            className="chamfer h-[38px] bg-paper px-4 text-2xs font-medium tracking-widest text-void transition-colors duration-150 ease-mech hover:bg-ink disabled:bg-line-strong disabled:text-mute"
          >
            [ SEND ]
          </button>
        )}
      </form>
    </section>
  );
}

// A turn starts at each user message and runs until the next one.
function groupTurns(items: ThreadItem[]) {
  const turns: ThreadItem[][] = [];
  for (const item of items) {
    if (item.type === 'user' || turns.length === 0) turns.push([]);
    turns[turns.length - 1].push(item);
  }
  return turns;
}

function Item({ item, live }: { item: ThreadItem; live: boolean }) {
  switch (item.type) {
    case 'user':
      return (
        <div className="flex gap-3 border border-line bg-panel px-3 py-2 text-sm">
          <span className="text-mute">&gt;</span>
          <p className="min-w-0 break-words whitespace-pre-wrap">{item.text}</p>
        </div>
      );
    case 'text':
      return (
        <div
          className={`markdown border-l pl-3 text-sm break-words transition-colors duration-200 ease-mech ${
            live ? 'border-cyan' : 'border-line'
          }`}
        >
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{ a: (props) => <a {...props} target="_blank" /> }}
          >
            {item.text}
          </Markdown>
        </div>
      );
    case 'tool': {
      const input = item.input as Record<string, unknown> | null;
      const summary = [
        'command',
        'file_path',
        'pattern',
        'description',
        'url',
        'query',
      ]
        .map((k) => input?.[k])
        .find((v): v is string => typeof v === 'string');
      return (
        <p className="flex gap-2 pl-3 text-2xs text-mute">
          <span className={`shrink-0 ${live ? 'text-cyan' : ''}`}>
            {item.name.toLowerCase()}
          </span>
          <span className="min-w-0 truncate">
            {summary?.split('\n')[0] ?? JSON.stringify(item.input)}
          </span>
        </p>
      );
    }
    case 'done':
      return (
        !item.ok && (
          <p className="pl-3 text-2xs tracking-widest text-alert">
            FAILED · {item.result}
          </p>
        )
      );
    case 'error':
      return (
        <p className="pl-3 text-sm break-words text-alert">{item.message}</p>
      );
  }
}
