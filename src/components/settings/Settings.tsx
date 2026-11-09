import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Permission, UsageWindow } from '../../agent-types';
import Button from '../ui/Button';
import useDismiss from '../ui/useDismiss';

interface Props {
  workspace: string;
  permission: Permission;
  onPermission(permission: Permission): void;
  onClose(): void;
}

const sections = ['Appearance', 'Agent', 'Usage', 'Hotkeys'] as const;

const themes = ['dark', 'cyber', 'light'];

const modes: [Permission, string, string][] = [
  ['auto', 'Auto', 'Approves safe actions, asks before risky ones'],
  ['default', 'Ask', 'Asks before every edit or command'],
  ['acceptEdits', 'Accept edits', 'Edits files freely, asks before commands'],
  ['plan', 'Plan', 'Reads and plans without changing anything'],
  ['bypassPermissions', 'Bypass', 'Runs everything without asking'],
];

const hotkeys = [
  ['Send message', 'Enter'],
  ['Previous / next prompt', '↑ / ↓'],
  ['Accept suggestion', 'Tab'],
  ['New thread', 'Ctrl + N'],
  ['Next / previous thread', 'Ctrl + Tab / Ctrl + Shift + Tab'],
  ['Open folder', 'Ctrl + O'],
  ['Open settings', 'Ctrl + ,'],
  ['Toggle todos', 'Ctrl + T'],
  ['Close popup', 'Esc'],
];

function Row({
  name,
  hint,
  children,
}: {
  name: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-6 border-b border-line py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{name}</p>
        {hint && <p className="text-2xs text-mute">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Segmented({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: string[];
  value?: string;
  onPick(option: string): void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onPick(o)}
          className="border border-line px-3 py-1 text-2xs tracking-widest uppercase transition-colors duration-150 ease-mech not-first:-ml-px not-aria-checked:text-mute not-aria-checked:hover:text-ink aria-checked:border-paper aria-checked:bg-paper aria-checked:text-void"
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export default function Settings({
  workspace,
  permission,
  onPermission,
  onClose,
}: Props) {
  const [section, setSection] =
    useState<(typeof sections)[number]>('Appearance');
  const [theme, setTheme] = useState(document.documentElement.dataset.theme);
  const [cycle, setCycle] = useState(localStorage.getItem('cycle') ?? 'active');
  const [usage, setUsage] = useState<
    'loading' | 'error' | UsageWindow[] | null
  >();
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useDismiss(dialog, true, onClose);

  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (section !== 'Usage' || usage !== undefined) return;
    setUsage('loading');
    window.agent.usage(workspace).then(setUsage, () => setUsage('error'));
  }, [section]);

  function pickTheme(next: string) {
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
    setTheme(next);
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-void/80 p-12">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="flex h-full max-h-120 w-full max-w-3xl border border-line-strong bg-void"
      >
        <nav className="flex w-44 shrink-0 flex-col border-r border-line bg-panel py-2">
          {sections.map((s) => (
            <button
              key={s}
              type="button"
              aria-current={section === s ? 'page' : undefined}
              onClick={() => setSection(s)}
              className="px-4 py-2 text-left text-sm text-mute transition-colors duration-150 ease-mech hover:bg-line hover:text-ink aria-[current=page]:bg-paper aria-[current=page]:text-void"
            >
              {s}
            </button>
          ))}
        </nav>
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-6">
            <h2 className="text-2xs tracking-widest uppercase">{section}</h2>
            <Button ref={close} aria-label="Close" onClick={onClose}>
              <X
                size={14}
                strokeWidth={1.5}
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-6">
            {section === 'Appearance' && (
              <Row name="Theme">
                <Segmented
                  label="Theme"
                  options={themes}
                  value={theme}
                  onPick={pickTheme}
                />
              </Row>
            )}
            {section === 'Agent' && (
              <div role="radiogroup" aria-label="Permission mode">
                {modes.map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-label={label}
                    aria-checked={permission === value}
                    onClick={() => onPermission(value)}
                    className="flex w-full items-center gap-3 border-b border-line py-3 text-left transition-colors duration-150 ease-mech not-aria-checked:text-mute not-aria-checked:hover:text-ink"
                  >
                    <span aria-hidden className="w-2 text-sm">
                      {permission === value && '>'}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm">{label}</span>
                      <span className="block text-2xs text-mute">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {section === 'Usage' &&
              (usage === undefined || usage === 'loading' ? (
                <p className="py-3 text-sm text-mute">Loading</p>
              ) : usage === 'error' ? (
                <p className="py-3 text-sm text-alert">Usage unavailable</p>
              ) : !usage?.length ? (
                <p className="py-3 text-sm text-mute">No plan limits</p>
              ) : (
                usage.map((w) => (
                  <Row
                    key={w.label}
                    name={w.label}
                    hint={
                      w.resetsAt
                        ? `Resets ${new Date(w.resetsAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
                        : undefined
                    }
                  >
                    <div className="flex w-48 items-center gap-3 text-2xs tracking-widest">
                      <div className="h-1 flex-1 bg-line">
                        <div
                          className={`h-full ${w.utilization >= 90 ? 'bg-alert' : 'bg-ink'}`}
                          style={{ width: `${Math.min(w.utilization, 100)}%` }}
                        />
                      </div>
                      <span className="w-10 text-right">
                        {Math.round(w.utilization)}%
                      </span>
                    </div>
                  </Row>
                ))
              ))}
            {section === 'Hotkeys' && (
              <>
                <Row
                  name="Thread cycling"
                  hint="Active skips read threads except the last one you left"
                >
                  <Segmented
                    label="Thread cycling"
                    options={['active', 'all']}
                    value={cycle}
                    onPick={(c) => {
                      localStorage.setItem('cycle', c);
                      setCycle(c);
                    }}
                  />
                </Row>
                {hotkeys.map(([action, keys]) => (
                  <Row key={action} name={action}>
                    <kbd className="border border-line px-2 py-0.5 text-2xs tracking-widest text-mute uppercase">
                      {keys}
                    </kbd>
                  </Row>
                ))}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
