import { useState } from 'react';
import type { Thread } from '../thread';

interface Props {
  workspace: string;
  onOpenWorkspace(): void;
  threads: Thread[];
  activeId: string;
  runningId?: string;
  onSelect(id: string): void;
  onNew(): void;
}

export default function Sidebar({
  workspace,
  onOpenWorkspace,
  threads,
  activeId,
  runningId,
  onSelect,
  onNew,
}: Props) {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
    setTheme(next);
  }

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
      <footer className="flex h-10 items-center border-t border-line px-4">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'light' ? 'Dark mode' : 'Light mode'}
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
