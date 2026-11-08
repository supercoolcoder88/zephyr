import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { flushSync } from 'react-dom';
import type { Image, ModelChoice, ThreadItem } from '../../agent-types';
import { stateDot, type Thread } from '../../thread';
import Composer from '../composer/Composer';
import Item, { summarize } from './Item';
import SubthreadDialog from './SubthreadDialog';
import Button from '../ui/Button';

const quoteWidth = 144;

interface Props {
  thread: Thread;
  running: boolean;
  justFinished: boolean;
  onSend(prompt: string, images: Image[], choice: ModelChoice): void;
  onCancel(): void;
  onPrompt(text: string): void;
  onImages(update: (images: Image[]) => Image[]): void;
  onAnswer(id: string, allow: boolean): void;
  composer: RefObject<HTMLTextAreaElement | null>;
}

export default function ChatThread({
  thread,
  running,
  justFinished,
  onSend,
  onCancel,
  onPrompt,
  onImages,
  onAnswer,
  composer,
}: Props) {
  const [prompt, setPrompt] = useState(thread.prompt ?? '');
  const scroller = useRef<HTMLDivElement>(null);
  // Follow new output only while the user is at the bottom.
  const pinned = useRef(true);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [listed, setListed] = useState<number[]>([]);
  const [viewing, setViewing] = useState<string>();
  const closeSubthread = useCallback(() => setViewing(undefined), []);
  const [quote, setQuote] = useState<{ text: string; rect: DOMRect }>();
  const items = thread.items ?? [];
  const turns = groupTurns(items);
  const permissions = thread.permissions ?? [];
  const subthreads = thread.subthreads ?? [];
  const viewed = subthreads.find((s) => s.id === viewing);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [items.length, permissions.length, thread.queued?.length]);

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
    const box = composer.current;
    box?.focus();
    box?.setSelectionRange(next.length, next.length);
  }

  function edit(text: string) {
    setPrompt(text);
    onPrompt(text);
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-6">
        <h1 className="truncate text-2xs tracking-widest uppercase">
          {thread.title}
        </h1>
        <span
          className={`text-2xs tracking-widest ${
            permissions.length
              ? 'text-ink'
              : running
                ? 'text-cyan'
                : 'text-mute'
          }`}
        >
          {permissions.length ? 'WAITING' : running ? 'RUNNING' : 'IDLE'}
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
          <div className="mx-auto max-w-4xl space-y-6">
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
              const subs = subthreads.filter((s) =>
                turn.some((i) => i.type === 'tool' && i.id === s.id),
              );
              const listing = listed.includes(t);
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
                  {(hidden > 0 || subs.length > 0) && (
                    <div className="flex justify-end gap-4">
                      {subs.length > 0 && (
                        <Button
                          aria-expanded={listing}
                          onClick={() => setListed(toggle(listed, t))}
                        >
                          {listing
                            ? '[ HIDE SUBTHREADS ]'
                            : `[ SUBTHREADS ${subs.length} ]`}
                        </Button>
                      )}
                      {hidden > 0 && (
                        <Button
                          aria-expanded={open}
                          onClick={() => setExpanded(toggle(expanded, t))}
                        >
                          {open ? '[ HIDE THINKING ]' : '[ SHOW THINKING ]'}
                        </Button>
                      )}
                    </div>
                  )}
                  {listing && (
                    <ul className="border border-line">
                      {subs.map((sub) => (
                        <li key={sub.id}>
                          <button
                            type="button"
                            onClick={() => setViewing(sub.id)}
                            className="flex w-full items-center gap-3 px-3 py-1 text-left text-sm transition-colors duration-150 ease-mech hover:bg-line"
                          >
                            <span
                              aria-label={sub.state}
                              className={`size-1.5 shrink-0 ${stateDot[sub.state]}`}
                            />
                            <span className="truncate">{sub.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            {thread.queued?.map((item) => (
              <div key={item.uuid} className="opacity-50">
                <Item item={item} live={false} />
              </div>
            ))}
            {permissions.map((request) => (
              <div
                key={request.id}
                role="group"
                aria-label="Permission request"
                className="flex items-start gap-4 border border-line-strong bg-panel px-3 py-2"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-2xs tracking-widest text-mute uppercase">
                    {request.tool}
                  </p>
                  <p className="text-sm break-words">
                    {request.title ?? summarize(request.input)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => onAnswer(request.id, true)}
                  >
                    [ ALLOW ]
                  </Button>
                  <Button
                    variant="destructive"
                    size="md"
                    onClick={() => onAnswer(request.id, false)}
                  >
                    [ DENY ]
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {quote && (
        <Button
          variant="primary"
          size="sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => quoteToChat(quote.text)}
          style={{
            top: Math.max(4, quote.rect.top - 28),
            left: Math.min(
              Math.max(4, quote.rect.right - quoteWidth),
              window.innerWidth - quoteWidth - 4,
            ),
          }}
          className="fixed z-10 w-36"
        >
          [ COPY TO CHAT ]
        </Button>
      )}

      {viewed && (
        <SubthreadDialog subthread={viewed} onClose={closeSubthread} />
      )}

      <Composer
        cwd={thread.cwd}
        running={running}
        waiting={permissions.length > 0}
        prompt={prompt}
        onPrompt={edit}
        images={thread.images ?? []}
        onImages={onImages}
        onSend={(text, images, choice) => {
          pinned.current = true;
          onSend(text, images, choice);
        }}
        onCancel={onCancel}
        composer={composer}
      />
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

const toggle = (list: number[], n: number) =>
  list.includes(n) ? list.filter((x) => x !== n) : [...list, n];
