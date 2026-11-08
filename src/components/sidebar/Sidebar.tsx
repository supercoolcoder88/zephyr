import { useEffect, useRef, useState } from 'react';
import type { Permission, UsageWindow } from '../../agent-types';
import { stateDot, threadState, type Thread } from '../../thread';

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
  permission: Permission;
  onPermission(permission: Permission): void;
}

// Read threads past this many are tucked into the archive at the bottom.
const KEEP_INACTIVE = 3;

const modes: [Permission, string][] = [
  ['auto', 'Auto'],
  ['default', 'Ask'],
  ['acceptEdits', 'Accept edits'],
  ['plan', 'Plan'],
  ['bypassPermissions', 'Bypass'],
];

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
  permission,
  onPermission,
}: Props) {
  const [confirmId, setConfirmId] = useState<string>();
  const [showArchived, setShowArchived] = useState(false);
  const [theme, setTheme] = useState(document.documentElement.dataset.theme);

  const [usage, setUsage] = useState<
    'closed' | 'loading' | 'error' | UsageWindow[] | null
  >('closed');
  const [modeOpen, setModeOpen] = useState(false);
  const footer = useRef<HTMLElement>(null);
  const usageOpen = usage !== 'closed';
  const popupOpen = usageOpen || modeOpen;

  useEffect(() => {
    if (!popupOpen) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === 'Escape'
          : !footer.current?.contains(e.target as Node)
      ) {
        setUsage('closed');
        setModeOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [popupOpen]);

  function toggleUsage() {
    setModeOpen(false);
    if (usageOpen) return setUsage('closed');
    setUsage('loading');
    window.agent.usage(workspace).then(
      (windows) => setUsage((u) => (u === 'closed' ? u : windows)),
      () => setUsage((u) => (u === 'closed' ? u : 'error')),
    );
  }

  const inactive = threads.filter(
    (t) => !t.draft && threadState(t, runningIds) === 'read',
  );
  const archived = inactive
    .slice(KEEP_INACTIVE)
    .filter((t) => t.id !== activeId);
  const current = threads.filter((t) => !archived.includes(t));

  function row(thread: Thread) {
    const active = thread.id === activeId;
    const confirming = confirmId === thread.id;
    return (
      <div
        key={thread.key ?? thread.id}
        onMouseLeave={() => setConfirmId(undefined)}
        onKeyDown={(e) => e.key === 'Escape' && setConfirmId(undefined)}
        onBlur={(e) =>
          !e.currentTarget.contains(e.relatedTarget) && setConfirmId(undefined)
        }
        className={`group flex items-center pr-4 transition-colors duration-150 ease-mech ${
          active ? 'bg-paper text-void' : 'text-ink hover:bg-line'
        }`}
      >
        <button
          onClick={() => onSelect(thread.id)}
          className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left text-sm"
        >
          <span
            aria-label={threadState(thread, runningIds)}
            className={`size-1.5 shrink-0 ${stateDot[threadState(thread, runningIds)]}`}
          />
          <span className="flex-1 truncate">{thread.title}</span>
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
  }

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
        {current.map(row)}
        {archived.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={showArchived}
              onClick={() => setShowArchived(!showArchived)}
              className="mt-2 flex h-8 w-full items-center px-4 text-2xs tracking-widest text-mute uppercase transition-colors duration-150 ease-mech hover:bg-line hover:text-ink"
            >
              {showArchived
                ? '[ HIDE ARCHIVED ]'
                : `[ ARCHIVED ${archived.length} ]`}
            </button>
            {showArchived && archived.map(row)}
          </>
        )}
      </nav>
      {error && <p className="px-4 py-2 text-2xs text-alert">{error}</p>}
      <footer
        ref={footer}
        className="relative flex h-10 items-center gap-3 border-t border-line px-4"
      >
        {usage !== 'closed' && (
          <div
            role="dialog"
            aria-label="Usage"
            className="absolute inset-x-0 bottom-full space-y-3 border-t border-line bg-panel px-4 py-3 text-2xs tracking-widest uppercase"
          >
            {usage === 'loading' ? (
              <p className="text-mute">Loading</p>
            ) : usage === 'error' ? (
              <p className="text-alert">Usage unavailable</p>
            ) : !usage?.length ? (
              <p className="text-mute">No plan limits</p>
            ) : (
              usage.map((w) => (
                <div key={w.label} className="space-y-1">
                  <div className="flex justify-between">
                    <span>{w.label}</span>
                    <span>{Math.round(w.utilization)}%</span>
                  </div>
                  <div className="h-1 bg-line">
                    <div
                      className={`h-full ${w.utilization >= 90 ? 'bg-alert' : 'bg-ink'}`}
                      style={{ width: `${Math.min(w.utilization, 100)}%` }}
                    />
                  </div>
                  {w.resetsAt && (
                    <p className="text-mute">
                      Resets{' '}
                      {new Date(w.resetsAt).toLocaleString(undefined, {
                        weekday: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
        {modeOpen && (
          <ul
            role="menu"
            aria-label="Permission mode"
            className="absolute inset-x-0 bottom-full border-t border-line bg-panel py-1 text-2xs tracking-widest uppercase"
          >
            {modes.map(([value, label]) => (
              <li key={value}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={permission === value}
                  onClick={() => {
                    onPermission(value);
                    setModeOpen(false);
                  }}
                  className={`flex w-full gap-2 px-4 py-1 text-left transition-colors duration-150 ease-mech hover:bg-paper hover:text-void ${
                    permission === value ? 'text-ink' : 'text-mute'
                  }`}
                >
                  <span aria-hidden className="w-2">
                    {permission === value && '>'}
                  </span>
                  {label}
                </button>
              </li>
            ))}
          </ul>
        )}
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
        <button
          type="button"
          onClick={toggleUsage}
          aria-label="Usage"
          aria-expanded={usageOpen}
          className={`transition-colors duration-150 ease-mech hover:text-ink ${!usageOpen ? 'text-mute' : 'text-ink'}`}
        >
          <svg
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="square"
          >
            <path d="M2 14h12M4 11v-3M8 11V3M12 11V6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => {
            setUsage('closed');
            setModeOpen(!modeOpen);
          }}
          aria-haspopup="menu"
          aria-expanded={modeOpen}
          className={`ml-auto text-2xs tracking-widest uppercase transition-colors duration-150 ease-mech hover:text-ink ${!modeOpen ? 'text-mute' : 'text-ink'}`}
        >
          [ {modes.find(([m]) => m === permission)?.[1] ?? permission} ]
        </button>
      </footer>
    </aside>
  );
}
