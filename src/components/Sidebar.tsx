import type { Thread } from '../thread';

interface Props {
  threads: Thread[];
  activeId: string;
  runningId?: string;
  onSelect(id: string): void;
  onNew(): void;
}

export default function Sidebar({
  threads,
  activeId,
  runningId,
  onSelect,
  onNew,
}: Props) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
      <header className="flex h-12 items-center justify-between border-b border-line px-4">
        <span className="text-sm font-medium tracking-[0.3em]">ZEPHYR</span>
        <button
          onClick={onNew}
          className="text-2xs tracking-widest text-mute transition-colors duration-150 ease-mech hover:text-ink"
        >
          [ + NEW ]
        </button>
      </header>
      <nav className="flex-1 overflow-y-auto py-2">
        {threads.map((thread, i) => {
          const active = thread.id === activeId;
          return (
            <button
              key={thread.id}
              onClick={() => onSelect(thread.id)}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors duration-150 ease-mech ${
                active ? 'bg-paper text-void' : 'text-ink hover:bg-line'
              }`}
            >
              <span
                className={`text-2xs ${active ? 'text-void/50' : 'text-mute'}`}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="flex-1 truncate">{thread.title}</span>
              {thread.id === runningId && (
                <span className="size-1.5 animate-pulse bg-cyan" />
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
