import { useEffect, useRef } from 'react';
import type { Subthread } from '../../agent-types';
import Button from '../ui/Button';
import useDismiss from '../ui/useDismiss';
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

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-void/80 p-12">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={subthread.title}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const items = [
            ...e.currentTarget.querySelectorAll<HTMLElement>(
              'button, a[href], [tabindex]:not([tabindex="-1"])',
            ),
          ];
          const edge = e.shiftKey ? items[0] : items.at(-1);
          if (document.activeElement !== edge) return;
          e.preventDefault();
          (e.shiftKey ? items.at(-1) : items[0])?.focus();
        }}
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
          <Button ref={close} onClick={onClose}>
            [ CLOSE ]
          </Button>
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
