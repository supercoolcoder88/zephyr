import { useEffect, useRef, useSyncExternalStore } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal, type ITheme } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import Button from '../ui/Button';

const palette = (): ITheme => {
  const css = getComputedStyle(document.documentElement);
  const color = (name: string) =>
    css.getPropertyValue(`--color-${name}`).trim();
  return {
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
  };
};

const watchTheme = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
};

interface Props {
  cwd: string;
  onClose(): void;
}

// Unmounted when closed; reopening replays the shell's saved output.
export default function TerminalDialog({ cwd, onClose }: Props) {
  const screen = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal>(null);
  const theme = useSyncExternalStore(
    watchTheme,
    () => document.documentElement.dataset.theme,
  );

  useEffect(() => {
    if (term.current) term.current.options.theme = palette();
  }, [theme]);

  useEffect(() => {
    const previous = document.activeElement;
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  useEffect(() => {
    let closed = false;
    let replayed = false;
    const t = new Terminal({
      fontSize: 13,
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue(
        '--font-mono',
      ),
      theme: palette(),
    });
    term.current = t;
    const fit = new FitAddon();
    t.loadAddon(fit);
    t.open(screen.current!);
    fit.fit();
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(screen.current!);
    const input = t.onData(
      (data) => replayed && window.terminal.write(cwd, data),
    );
    const resize = t.onResize(({ cols, rows }) =>
      window.terminal.resize(cwd, cols, rows),
    );
    let output = () => {};
    void window.terminal.open(cwd, t.cols, t.rows).then((saved) => {
      if (closed) return;
      // Replayed output holds the shell's old terminal queries; their answers must not reach it.
      t.write(saved, () => (replayed = true));
      output = window.terminal.onData(
        (from, data) => from === cwd && t.write(data),
      );
      if (!screen.current?.closest('[inert]')) t.focus();
    });
    return () => {
      closed = true;
      observer.disconnect();
      input.dispose();
      resize.dispose();
      output();
      t.dispose();
      term.current = null;
    };
  }, [cwd]);

  return (
    <div
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      // App shortcuts stay out of the shell's way; Ctrl+` is caught before this.
      onKeyDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-20 flex items-center justify-center bg-void/80 p-12"
    >
      <div
        role="dialog"
        aria-modal
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
