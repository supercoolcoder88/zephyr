import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Pin,
  PinOff,
  Plus,
  Settings as SettingsIcon,
  X,
} from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Permission, UpdateStatus } from '../../agent-types';
import {
  busy,
  stateDot,
  threadState,
  type Pins,
  type Thread,
} from '../../thread';
import Button from '../ui/Button';
import Settings from '../settings/Settings';

interface Props {
  workspace: string;
  projects: string[];
  collapsed: string[];
  onToggle(cwd: string): void;
  onOpenProject(): void;
  onCloseProject(cwd: string): void;
  current: Thread[];
  archived: Thread[];
  onArchive(id: string, value: boolean): void;
  pinned: Pins;
  onPin(id: string, value: boolean): void;
  activeId: string;
  onSelect(id: string): void;
  onNew(cwd?: string): void;
  onDelete(id: string): void;
  error?: string;
  permission: Permission;
  onPermission(permission: Permission): void;
}

const icon = {
  size: 14,
  strokeWidth: 1.5,
  strokeLinecap: 'square',
  strokeLinejoin: 'miter',
} as const;

const projectName = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).pop();

export default function Sidebar({
  workspace,
  projects,
  collapsed,
  onToggle,
  onOpenProject,
  onCloseProject,
  current,
  archived,
  onArchive,
  pinned,
  onPin,
  activeId,
  onSelect,
  onNew,
  onDelete,
  error,
  permission,
  onPermission,
}: Props) {
  const [confirmId, setConfirmId] = useState<string>();
  const [showArchived, setShowArchived] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [update, setUpdate] = useState<UpdateStatus>({ commits: [] });

  useEffect(() => {
    window.update.check().then(setUpdate, () => {});
  }, []);

  const expanded = projects.filter((p) => !collapsed.includes(p));
  const listed = (cwd: string) => current.filter((t) => t.cwd === cwd);

  const lastRead = useRef<string>(undefined);
  useEffect(() => () => void (lastRead.current = activeId), [activeId]);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    // Plain Tab never moves focus between controls.
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) return e.preventDefault();
    if ((!e.ctrlKey && !e.metaKey) || document.querySelector('[aria-modal]'))
      return;
    const key = e.key.toLowerCase();
    if (key === 'tab') {
      const shown = [
        ...expanded.flatMap(listed),
        ...(showArchived ? archived : []),
      ];
      const cycle =
        localStorage.getItem('cycle') === 'all'
          ? shown
          : shown.filter(
              (t) =>
                t.id === activeId ||
                t.id === lastRead.current ||
                threadState(t) !== 'read',
            );
      const i = cycle.findIndex((t) => t.id === activeId);
      const next = cycle.at((i + (e.shiftKey ? -1 : 1)) % cycle.length);
      if (next && next.id !== activeId) onSelect(next.id);
    } else if (key === 'n') onNew();
    else if (key === 'o') onOpenProject();
    else if (key === ',') setSettingsOpen(true);
    else return;
    e.preventDefault();
  });

  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  function row(thread: Thread, isArchived = false) {
    const active = thread.id === activeId;
    const confirming = confirmId === thread.id;
    const isPinned = thread.id in pinned;
    return (
      <div
        key={thread.key}
        onMouseLeave={() => setConfirmId(undefined)}
        onKeyDown={(e) => e.key === 'Escape' && setConfirmId(undefined)}
        onBlur={(e) =>
          !e.currentTarget.contains(e.relatedTarget) && setConfirmId(undefined)
        }
        className={`group relative flex items-center transition-colors duration-150 ease-mech ${
          active ? 'bg-paper text-void' : 'text-ink hover:bg-line'
        }`}
      >
        <button
          type="button"
          aria-current={active ? 'page' : undefined}
          onClick={() => onSelect(thread.id)}
          className="flex min-w-0 flex-1 items-center gap-2 px-4 py-2 text-left text-sm"
        >
          <span
            aria-label={threadState(thread)}
            className={`mx-1 size-1.5 shrink-0 ${stateDot[threadState(thread)]}`}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{thread.title}</span>
            {isArchived && (
              <span
                className={`block truncate text-2xs ${active ? 'text-void/50' : 'text-mute'}`}
              >
                {projectName(thread.cwd)}
              </span>
            )}
          </span>
          {isPinned && (
            <Pin
              {...icon}
              role="img"
              aria-label="Pinned"
              className={`shrink-0 ${active ? 'text-void/50' : 'text-mute'}`}
            />
          )}
          {thread.worktree && (
            <span
              title={thread.branch}
              className={`shrink-0 ${active ? 'text-void/50' : 'text-mute'}`}
            >
              <GitBranch
                {...icon}
                role="img"
                aria-label={thread.branch ?? 'Worktree'}
              />
            </span>
          )}
        </button>
        {!busy(thread) && (
          <span
            className={`absolute inset-y-0 right-0 flex items-center gap-1 bg-inherit pr-4 pl-3 transition-opacity duration-150 ease-mech ${
              confirming
                ? 'text-alert'
                : `opacity-0 group-hover:opacity-100 group-has-focus-visible:opacity-100 ${active ? 'text-void/50' : 'text-mute'}`
            }`}
          >
            {!confirming && !thread.draft && !isArchived && (
              <button
                type="button"
                aria-label={isPinned ? 'Unpin' : 'Pin'}
                onClick={() => onPin(thread.id, !isPinned)}
                className={`grid size-5 place-items-center transition-colors duration-150 ease-mech ${active ? 'hover:text-void' : 'hover:text-ink'}`}
              >
                {isPinned ? <PinOff {...icon} /> : <Pin {...icon} />}
              </button>
            )}
            {!confirming && !thread.draft && (
              <button
                type="button"
                aria-label={isArchived ? 'Unarchive' : 'Archive'}
                onClick={() => onArchive(thread.id, !isArchived)}
                className={`grid size-5 place-items-center transition-colors duration-150 ease-mech ${active ? 'hover:text-void' : 'hover:text-ink'}`}
              >
                {isArchived ? <ArrowUp {...icon} /> : <ArrowDown {...icon} />}
              </button>
            )}
            <button
              type="button"
              aria-label={confirming ? undefined : 'Delete'}
              onClick={() =>
                confirming ? onDelete(thread.id) : setConfirmId(thread.id)
              }
              className="grid h-5 min-w-5 place-items-center text-2xs tracking-widest transition-colors duration-150 ease-mech hover:text-alert"
            >
              {confirming ? '[ CONFIRM ]' : <X {...icon} />}
            </button>
          </span>
        )}
      </div>
    );
  }

  return (
    <aside className="flex min-w-0 flex-1 flex-col bg-panel">
      <header className="flex h-12 items-center justify-between border-b border-line px-4">
        <span className="flex items-baseline gap-2">
          <span className="text-sm font-medium tracking-[0.3em]">ZEPHYR</span>
          {import.meta.env.DEV && (
            <span className="text-2xs tracking-widest text-mute">DEV</span>
          )}
        </span>
      </header>
      <nav className="flex-1 overflow-y-auto py-2">
        {projects.map((cwd) => {
          const name = projectName(cwd);
          const open = expanded.includes(cwd);
          return (
            <section key={cwd} aria-label={name}>
              <div className="group flex h-8 items-center text-2xs tracking-widest text-mute">
                <h2 className="min-w-0 flex-1">
                  <button
                    type="button"
                    title={cwd}
                    aria-expanded={open}
                    onClick={() => onToggle(cwd)}
                    className="flex h-8 w-full items-center gap-2 pl-4 uppercase transition-colors duration-150 ease-mech hover:text-ink"
                  >
                    {open ? (
                      <ChevronDown {...icon} />
                    ) : (
                      <ChevronRight {...icon} />
                    )}
                    <span className="truncate">{name}</span>
                  </button>
                </h2>
                <span className="flex items-center gap-1 pr-4 pl-3 opacity-0 transition-opacity duration-150 ease-mech group-focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label={`New in ${name}`}
                    onClick={() => onNew(cwd)}
                    className="grid size-5 place-items-center transition-colors duration-150 ease-mech hover:text-ink"
                  >
                    <Plus {...icon} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${name}`}
                    onClick={() => onCloseProject(cwd)}
                    className="grid size-5 place-items-center transition-colors duration-150 ease-mech hover:text-ink"
                  >
                    <X {...icon} />
                  </button>
                </span>
              </div>
              {open && listed(cwd).map((t) => row(t))}
            </section>
          );
        })}
        {archived.length > 0 && (
          <>
            <Button
              size="md"
              aria-expanded={showArchived}
              onClick={() => setShowArchived(!showArchived)}
              className="mt-2 w-full hover:bg-line"
            >
              {showArchived
                ? '[ HIDE ARCHIVED ]'
                : `[ ARCHIVED ${archived.length} ]`}
            </Button>
            {showArchived && archived.map((t) => row(t, true))}
          </>
        )}
      </nav>
      {error && <p className="px-4 py-2 text-2xs text-alert">{error}</p>}
      <footer className="flex h-10 items-center border-t border-line px-4">
        <Button
          aria-label="Settings"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(true)}
          className="relative"
        >
          <SettingsIcon {...icon} />
          {(update.commits.length > 0 || update.error) && (
            <span
              title="Update available"
              className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-warn"
            />
          )}
        </Button>
        <Button onClick={onOpenProject} className="ml-auto">
          [ + PROJECT ]
        </Button>
      </footer>
      {settingsOpen && (
        <Settings
          permission={permission}
          onPermission={onPermission}
          update={update}
          workspace={workspace}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </aside>
  );
}
