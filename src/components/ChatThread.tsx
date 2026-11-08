import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type Ref,
} from 'react';
import { flushSync } from 'react-dom';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import type {
  AgentApi,
  Model,
  ModelChoice,
  SlashCommand,
  ThreadItem,
} from '../agent-types';
import type { Thread } from '../thread';

// Listing commands and models spawns a CLI, so do it once per workspace.
const catalogs = new Map<string, ReturnType<AgentApi['catalog']>>();

interface Props {
  thread: Thread;
  running: boolean;
  justFinished: boolean;
  onSend(prompt: string, choice: ModelChoice): void;
  onCancel(): void;
  onPrompt(text: string): void;
  composer: Ref<HTMLTextAreaElement>;
}

export default function ChatThread({
  thread,
  running,
  justFinished,
  onSend,
  onCancel,
  onPrompt,
  composer,
}: Props) {
  const [prompt, setPrompt] = useState(thread.prompt ?? '');
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  // Cached so the composer shows the model and effort before the catalog loads.
  const [models, setModels] = useState<Model[]>(() =>
    JSON.parse(localStorage.getItem('models') ?? '[]'),
  );
  const [choice, setChoice] = useState<ModelChoice>(() =>
    JSON.parse(localStorage.getItem('model') ?? '{"model":"opus"}'),
  );
  const [picking, setPicking] = useState(false);
  const [hovered, setHovered] = useState<string>();
  const [selected, setSelected] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // Follow new output only while the user is at the bottom.
  const pinned = useRef(true);
  const menu = useRef<HTMLUListElement>(null);
  const picker = useRef<HTMLUListElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [quote, setQuote] = useState<{ text: string; rect: DOMRect }>();
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
    let catalog = catalogs.get(thread.cwd);
    if (!catalog) {
      catalog = window.agent.catalog(thread.cwd);
      catalogs.set(thread.cwd, catalog);
      catalog.catch(() => catalogs.delete(thread.cwd));
    }
    let live = true;
    catalog
      .then((c) => {
        if (!live) return;
        setCommands(c.commands);
        setModels(c.models);
        localStorage.setItem('models', JSON.stringify(c.models));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [thread.cwd]);

  useEffect(() => {
    menu.current?.children[highlighted]?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  function readSelection() {
    const sel = document.getSelection();
    const el = scroller.current;
    const text = sel?.toString().trim();
    if (!sel || !text || !el) return;
    if (!el.contains(sel.anchorNode) || !el.contains(sel.focusNode)) return;
    return { text, rect: sel.getRangeAt(0).getBoundingClientRect() };
  }

  useEffect(() => {
    const show = () => setQuote(readSelection());
    const check = () => {
      if (!readSelection()) setQuote(undefined);
    };
    document.addEventListener('mouseup', show);
    document.addEventListener('selectionchange', check);
    return () => {
      document.removeEventListener('mouseup', show);
      document.removeEventListener('selectionchange', check);
    };
  }, []);

  function quoteToChat(text: string) {
    const lines = text.split('\n').map((l) => (l ? `> ${l}` : '>'));
    const draft = prompt.trimEnd();
    const next = `${draft ? `${draft}\n\n` : ''}${lines.join('\n')}\n\n`;
    flushSync(() => edit(next));
    document.getSelection()?.removeAllRanges();
    setQuote(undefined);
    const box = typeof composer === 'object' ? composer?.current : null;
    box?.focus();
    box?.setSelectionRange(next.length, next.length);
  }

  function edit(text: string) {
    setPrompt(text);
    onPrompt(text);
    setSelected(0);
    setDismissed(false);
  }

  function send(text: string) {
    if (!text.trim() || running) return;
    onSend(text, choice);
    pinned.current = true;
    edit('');
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    send(prompt);
  }

  function choose(next: ModelChoice) {
    setChoice(next);
    localStorage.setItem('model', JSON.stringify(next));
    setPicking(false);
    trigger.current?.focus();
  }

  const current = models.find((m) => m.value === choice.model);
  const effort = choice.effort ?? current?.defaultEffort;

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
          setQuote(undefined);
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

      {quote && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => quoteToChat(quote.text)}
          style={{
            top: Math.max(4, quote.rect.top - 28),
            left: Math.min(
              Math.max(4, quote.rect.right - 140),
              window.innerWidth - 144,
            ),
          }}
          className="fixed z-10 h-6 w-[140px] bg-paper text-2xs tracking-widest text-void transition-colors duration-150 ease-mech hover:bg-ink"
        >
          [ COPY TO CHAT ]
        </button>
      )}

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
        <div
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setPicking(false);
          }}
          onKeyDown={(e) => {
            const el = e.target as HTMLElement;
            const list = el.closest('[role=menu]');
            const items = [
              ...((list ?? picker.current)?.querySelectorAll<HTMLElement>(
                ':scope > li > button',
              ) ?? []),
            ];
            const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
            let next: Element | null | undefined;
            if (e.key === 'Escape' && picking) {
              setPicking(false);
              next = trigger.current;
            } else if (step && items.length > 0) {
              const at = Math.max(items.indexOf(el), step > 0 ? -1 : 0);
              next = items[(at + step + items.length) % items.length];
            } else if (e.key === 'ArrowLeft' && list === picker.current) {
              next = el.parentElement?.querySelector(
                ':scope > [role=menu] button',
              );
            } else if (e.key === 'ArrowRight' && list !== picker.current) {
              next = list?.parentElement?.firstElementChild;
            }
            if (!(next instanceof HTMLElement)) return;
            e.preventDefault();
            next.focus();
          }}
        >
          <button
            ref={trigger}
            type="button"
            aria-haspopup="menu"
            aria-expanded={picking}
            onClick={() => {
              setHovered(choice.model);
              setPicking(!picking);
            }}
            className={`flex h-[38px] items-center gap-2 px-2 text-2xs tracking-widest uppercase transition-colors duration-150 ease-mech hover:text-ink ${
              picking ? 'text-ink' : 'text-mute'
            }`}
          >
            <span>
              {current?.displayName ?? choice.model}
              {effort && ` · ${effort}`}
            </span>
            <span aria-hidden>{picking ? '▲' : '▼'}</span>
          </button>
          {picking && (
            <ul
              ref={picker}
              role="menu"
              className="absolute right-3 bottom-full border border-b-0 border-line bg-panel py-1"
            >
              {models.map((m) => {
                const active = m.value === choice.model;
                return (
                  <li
                    key={m.value}
                    onMouseEnter={() => setHovered(m.value)}
                    onFocus={() => setHovered(m.value)}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => choose({ model: m.value })}
                      className={`flex w-full items-center gap-2 py-1 pr-3 pl-2 text-left text-sm whitespace-nowrap transition-colors duration-150 ease-mech ${
                        hovered === m.value
                          ? 'bg-paper text-void'
                          : active
                            ? 'text-ink'
                            : 'text-mute'
                      }`}
                    >
                      <span aria-hidden className="w-2">
                        {active && '>'}
                      </span>
                      {m.displayName}
                      <span
                        aria-hidden
                        className={`ml-auto pl-8 text-2xs tracking-widest uppercase ${
                          hovered === m.value ? '' : 'text-mute'
                        }`}
                      >
                        {active ? effort : m.defaultEffort}
                      </span>
                    </button>
                    {hovered === m.value && m.efforts.length > 0 && (
                      <ul
                        role="menu"
                        aria-label={`${m.displayName} effort`}
                        className="absolute right-full bottom-0 border border-b-0 border-line bg-panel py-1"
                      >
                        {m.efforts.map((level) => {
                          const on =
                            level === (active ? effort : m.defaultEffort);
                          return (
                            <li key={level}>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() =>
                                  choose({ model: m.value, effort: level })
                                }
                                className={`group flex w-full items-center gap-2 py-1 pr-3 pl-2 text-left text-sm whitespace-nowrap transition-colors duration-150 ease-mech hover:bg-paper hover:text-void focus:bg-paper focus:text-void ${
                                  on ? 'text-ink' : 'text-mute'
                                }`}
                              >
                                <span aria-hidden className="w-2">
                                  {on && '>'}
                                </span>
                                {level}
                                <span
                                  aria-hidden
                                  className="ml-auto pl-6 text-2xs tracking-widest text-mute uppercase group-hover:text-void group-focus:text-void"
                                >
                                  {level === m.defaultEffort && 'default'}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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
            components={{
              a: (props) => <a {...props} target="_blank" />,
              table: (props) => (
                <div className="overflow-x-auto">
                  <table {...props} />
                </div>
              ),
            }}
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
        <p className="flex gap-2 border-l border-transparent pl-3 text-2xs text-mute">
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
          <p className="border-l border-transparent pl-3 text-2xs tracking-widest text-alert">
            FAILED · {item.result}
          </p>
        )
      );
    case 'error':
      return (
        <p className="border-l border-transparent pl-3 text-sm break-words text-alert">
          {item.message}
        </p>
      );
  }
}
