import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import type { ThreadItem } from '../agent-types';
import type { Thread } from '../thread';

const tokens = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

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
  const [expanded, setExpanded] = useState<number[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const items = thread.items ?? [];
  const turns = groupTurns(items);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [items.length]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!prompt.trim() || running) return;
    onSend(prompt);
    setPrompt('');
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col">
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

      <div className="flex-1 overflow-y-auto px-6 py-6">
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
        <div ref={bottom} />
      </div>

      <form
        onSubmit={submit}
        className={`flex shrink-0 items-end gap-2 border-t border-line bg-panel p-3 ${running ? 'scanline' : ''}`}
      >
        <textarea
          ref={composer}
          autoFocus
          rows={1}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing)
              return;
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
        <p
          className={`pl-3 text-2xs tracking-widest ${item.ok ? 'text-mute' : 'text-alert'}`}
        >
          {item.ok ? 'DONE' : `FAILED · ${item.result}`} · $
          {item.costUsd.toFixed(4)} · {tokens.format(item.inputTokens)} IN ·{' '}
          {tokens.format(item.outputTokens)} OUT
        </p>
      );
    case 'error':
      return (
        <p className="pl-3 text-sm break-words text-alert">{item.message}</p>
      );
  }
}
