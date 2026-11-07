import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Thread, ThreadItem } from '../thread';

interface Props {
  thread: Thread;
  running: boolean;
  // Another thread holds the window's single agent run.
  busy: boolean;
  justFinished: boolean;
  onSend(prompt: string): void;
  onCancel(): void;
}

export default function ChatThread({
  thread,
  running,
  busy,
  justFinished,
  onSend,
  onCancel,
}: Props) {
  const [prompt, setPrompt] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const turns = groupTurns(thread.items);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [thread.items.length]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || running || busy) return;
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
              return (
                <div
                  key={t}
                  className={`space-y-2 ${last && justFinished ? 'flash' : ''}`}
                >
                  {turn.map((item, i) => (
                    <Item
                      key={i}
                      item={item}
                      live={running && last && i === turn.length - 1}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={submit}
        className={`flex shrink-0 gap-2 border-t border-line bg-panel p-3 ${running ? 'scanline' : ''}`}
      >
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={busy ? 'Another thread is running…' : 'Ask the agent…'}
          disabled={busy}
          className="flex-1 border border-line bg-void px-3 py-2 text-sm outline-none placeholder:text-mute focus:border-line-strong disabled:opacity-50"
        />
        {running ? (
          <button
            type="button"
            onClick={onCancel}
            className="border border-alert px-4 text-2xs tracking-widest text-alert transition-colors duration-150 ease-mech hover:bg-alert hover:text-void"
          >
            [ STOP ]
          </button>
        ) : (
          <button
            type="submit"
            disabled={busy || !prompt.trim()}
            className="chamfer bg-paper px-4 text-2xs font-medium tracking-widest text-void transition-colors duration-150 ease-mech hover:bg-ink disabled:bg-line-strong disabled:text-mute"
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
          <p className="whitespace-pre-wrap">{item.text}</p>
        </div>
      );
    case 'text':
      return (
        <p
          className={`border-l pl-3 text-sm whitespace-pre-wrap transition-colors duration-200 ease-mech ${
            live ? 'border-cyan' : 'border-line'
          }`}
        >
          {item.text}
        </p>
      );
    case 'tool':
      return (
        <div className="flex items-center gap-3 pl-3 text-2xs">
          <span
            className={`shrink-0 bg-paper px-1.5 py-0.5 font-medium tracking-widest text-void uppercase ${live ? 'glow' : ''}`}
          >
            {item.name}
          </span>
          <span className="truncate text-mute">
            {JSON.stringify(item.input)}
          </span>
        </div>
      );
    case 'done':
      return (
        <p
          className={`pl-3 text-2xs tracking-widest ${item.ok ? 'text-mute' : 'text-alert'}`}
        >
          {item.ok ? 'DONE' : `FAILED · ${item.result}`} · $
          {item.costUsd.toFixed(4)}
        </p>
      );
    case 'error':
      return <p className="pl-3 text-sm text-alert">{item.message}</p>;
  }
}
