import { useEffect, useEffectEvent, useRef } from 'react';
import { FitAddon, init, Terminal } from 'ghostty-web';
import Button from '../ui/Button';

const ready = init();

interface Props {
  cwd: string;
  open: boolean;
  onClose(): void;
  onExit(): void;
}

// Stays mounted while hidden so the display keeps its screen and scrollback.
export default function TerminalDialog({ cwd, open, onClose, onExit }: Props) {
  const screen = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal>(undefined);
  const exit = useEffectEvent(() => {
    if (open) onClose();
    onExit();
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    term.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [open]);

  useEffect(() => {
    const cleanup: (() => void)[] = [];
    let closed = false;
    ready.then(async () => {
      if (closed || !screen.current) return;
      const css = getComputedStyle(document.documentElement);
      const color = (name: string) =>
        css.getPropertyValue(`--color-${name}`).trim();
      const t = new Terminal({
        fontSize: 13,
        fontFamily: css.getPropertyValue('--font-mono'),
        theme: {
          background: color('void'),
          foreground: color('ink'),
          cursor: color('ink'),
          selectionBackground: color('line-strong'),
          black: color('line'),
          brightBlack: color('mute'),
          red: color('code-red'),
          green: color('code-green'),
          yellow: color('code-yellow'),
          blue: color('code-blue'),
          magenta: color('code-purple'),
          cyan: color('code-cyan'),
          white: color('ink'),
        },
      });
      const fit = new FitAddon();
      t.loadAddon(fit);
      t.open(screen.current);
      fit.fit();
      fit.observeResize();
      cleanup.push(() => t.dispose());
      const output = await window.terminal.open(cwd, t.cols, t.rows);
      if (closed) return;
      // Only non-empty after a window reload; ghostty-web throws on an empty write.
      if (output) t.write(output);
      term.current = t;
      if (!screen.current.closest('[inert]')) t.focus();
      const input = t.onData((data) => window.terminal.write(cwd, data));
      const resize = t.onResize(({ cols, rows }) =>
        window.terminal.resize(cwd, cols, rows),
      );
      cleanup.push(
        () => input.dispose(),
        () => resize.dispose(),
        window.terminal.onData((from, data) => from === cwd && t.write(data)),
        window.terminal.onExit((from) => from === cwd && exit()),
      );
    });
    return () => {
      closed = true;
      cleanup.forEach((fn) => fn());
    };
  }, [cwd]);

  return (
    <div
      aria-hidden={!open}
      inert={!open}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      // App shortcuts stay out of the shell's way; Ctrl+` is caught before this.
      onKeyDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-20 flex items-center justify-center bg-void/80 p-12 aria-hidden:invisible"
    >
      <div
        role="dialog"
        aria-modal={open || undefined}
        aria-label="Terminal"
        className="flex h-full w-full max-w-5xl flex-col border border-line-strong bg-void"
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-6">
          <h2 className="text-2xs tracking-widest uppercase">Terminal</h2>
          <Button onClick={onClose}>[ CLOSE ]</Button>
        </header>
        <div className="min-h-0 flex-1 px-4 py-2">
          <div ref={screen} className="relative size-full caret-transparent" />
        </div>
      </div>
    </div>
  );
}
