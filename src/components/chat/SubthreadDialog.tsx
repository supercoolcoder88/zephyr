import { useEffect } from 'react';
import type { Subthread } from '../../agent-types';
import Item from './Item';

const status: Record<Subthread['state'], string> = {
  running: 'RUNNING',
  done: 'DONE',
  error: 'FAILED',
  read: 'STOPPED',
};

interface Props {
  subthread: Subthread;
  onClose(): void;
}

export default function SubthreadDialog({ subthread, onClose }: Props) {
  const running = subthread.state === 'running';

  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);

  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-20 flex items-center justify-center bg-void/80 p-12"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={subthread.title}
        className="flex max-h-full w-full max-w-3xl flex-col border border-line-strong bg-void"
      >
        <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line px-6">
          <h2 className="flex-1 truncate text-2xs tracking-widest uppercase">
            {subthread.title}
          </h2>
          <span
            className={`text-2xs tracking-widest ${running ? 'text-cyan' : 'text-mute'}`}
          >
            {status[subthread.state]}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-2xs tracking-widest text-mute transition-colors duration-150 ease-mech hover:text-ink"
          >
            [ CLOSE ]
          </button>
        </header>
        <div className="min-h-0 space-y-2 overflow-y-auto px-6 py-6">
          {subthread.items.length === 0 ? (
            <p className="text-center text-2xs tracking-widest text-mute">
              NO OUTPUT YET
            </p>
          ) : (
            subthread.items.map((item, i) => (
              <Item
                key={i}
                item={item}
                live={running && i === subthread.items.length - 1}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
