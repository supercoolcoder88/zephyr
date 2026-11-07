import { useState } from 'react';
import { threadState, type Thread, type ThreadState } from '../thread';

const dot: Record<ThreadState, string> = {
  attention: 'bg-warn',
  error: 'bg-alert',
  done: 'bg-ok',
  running: 'animate-pulse bg-cyan',
  read: 'bg-mute',
};

interface Props {
  workspace: string;
  onOpenWorkspace(): void;
  threads: Thread[];
  activeId: string;
  runningIds: string[];
  onSelect(id: string): void;
  onNew(): void;
  onDelete(id: string): void;
  error?: string;
}

const nextTheme: Record<string, string> = {
  dark: 'cyber',
  cyber: 'light',
  light: 'dark',
};

export default function Sidebar({
  workspace,
  onOpenWorkspace,
  threads,
  activeId,
  runningIds,
  onSelect,
  onNew,
  onDelete,
  error,
}: Props) {
  const [confirmId, setConfirmId] = useState<string>();
  const [theme, setTheme] = useState(document.documentElement.dataset.theme);

  function toggleTheme() {
    const next = nextTheme[theme ?? 'dark'];
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
    setTheme(next);
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
      <header className="flex h-12 items-center justify-between border-b border-line px-4">
        <span className="flex items-baseline gap-2">
          <span className="text-sm font-medium tracking-[0.3em]">ZEPHYR</span>
          {import.meta.env.DEV && (
            <span className="text-2xs tracking-widest text-mute">DEV</span>
          )}
        </span>
        <button
          onClick={onNew}
          className="text-2xs tracking-widest text-mute transition-colors duration-150 ease-mech hover:text-ink"
        >
          [ + NEW ]
        </button>
      </header>
      <button
        type="button"
        onClick={onOpenWorkspace}
        title={workspace}
        className="flex h-8 w-full items-center border-b border-line px-4 text-left text-2xs tracking-widest text-mute uppercase transition-colors duration-150 ease-mech hover:bg-line hover:text-ink"
      >
        <span className="truncate">
          {workspace.split(/[\\/]/).filter(Boolean).pop()}
        </span>
      </button>
      <nav className="flex-1 overflow-y-auto py-2">
        {threads.map((thread) => {
          const active = thread.id === activeId;
          const confirming = confirmId === thread.id;
          return (
            <div
              key={thread.key ?? thread.id}
              onMouseLeave={() => setConfirmId(undefined)}
              onKeyDown={(e) => e.key === 'Escape' && setConfirmId(undefined)}
              onBlur={(e) =>
                !e.currentTarget.contains(e.relatedTarget) &&
                setConfirmId(undefined)
              }
              className={`group flex items-center pr-4 transition-colors duration-150 ease-mech ${
                active ? 'bg-paper text-void' : 'text-ink hover:bg-line'
              }`}
            >
              <button
                onClick={() => onSelect(thread.id)}
                className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left text-sm"
              >
                <span className="flex-1 truncate">{thread.title}</span>
                <span
                  aria-label={threadState(thread, runningIds)}
                  className={`size-1.5 shrink-0 ${dot[threadState(thread, runningIds)]}`}
                />
              </button>
              {!runningIds.includes(thread.id) && (
                <button
                  type="button"
                  onClick={() =>
                    confirming ? onDelete(thread.id) : setConfirmId(thread.id)
                  }
                  className={`shrink-0 pl-3 text-2xs tracking-widest transition-[color,opacity] duration-150 ease-mech hover:text-alert ${
                    confirming
                      ? 'text-alert'
                      : `opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 ${active ? 'text-void/50' : 'text-mute'}`
                  }`}
                >
                  {confirming ? '[ CONFIRM ]' : '[ DEL ]'}
                </button>
              )}
            </div>
          );
        })}
      </nav>
      {error && <p className="px-4 py-2 text-2xs text-alert">{error}</p>}
      <footer className="flex h-10 items-center border-t border-line px-4">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`${nextTheme[theme ?? 'dark']} mode`}
          className="text-mute transition-colors duration-150 ease-mech hover:text-ink"
        >
          <svg
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="square"
          >
            {theme === 'light' ? (
              <path d="M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5Z" />
            ) : theme === 'dark' ? (
              <path d="M8 2 14.5 13.5h-13Z" />
            ) : (
              <>
                <rect x="5" y="5" width="6" height="6" />
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5 13 13M3 13l1.5-1.5M11.5 4.5 13 3" />
              </>
            )}
          </svg>
        </button>
      </footer>
    </aside>
  );
}
