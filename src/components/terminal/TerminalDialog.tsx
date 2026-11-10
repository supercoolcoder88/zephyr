import { useEffect, useRef, useSyncExternalStore } from 'react';
import { FitAddon, init, Terminal } from 'ghostty-web';
import Button from '../ui/Button';

const ready = init();

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

// Unmounted when closed, as ghostty-web redraws every frame; reopening replays the shell's saved output.
export default function TerminalDialog({ cwd, onClose }: Props) {
  const screen = useRef<HTMLDivElement>(null);
  // ghostty-web can't restyle a live display, so a theme change rebuilds it from the shell's saved output.
  const theme = useSyncExternalStore(
    watchTheme,
    () => document.documentElement.dataset.theme,
  );

  useEffect(() => {
    const previous = document.activeElement;
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

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
      // Empty for a new shell, and ghostty-web throws on an empty write.
      if (output) t.write(output);
      if (!screen.current.closest('[inert]')) t.focus();
      const input = t.onData((data) => window.terminal.write(cwd, data));
      const resize = t.onResize(({ cols, rows }) =>
        window.terminal.resize(cwd, cols, rows),
      );
      cleanup.push(
        () => input.dispose(),
        () => resize.dispose(),
        window.terminal.onData((from, data) => from === cwd && t.write(data)),
      );
    });
    return () => {
      closed = true;
      cleanup.forEach((fn) => fn());
    };
  }, [cwd, theme]);

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
