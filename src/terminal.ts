import { app, ipcMain, webContents } from 'electron';
import { spawn, type IPty } from 'node-pty';

const limit = 256 * 1024;
// One shell per workspace, kept with its recent output so a reloaded window can replay it.
const shells = new Map<string, { pty: IPty; output: string }>();

export function registerTerminalIpc() {
  const broadcast = (channel: string, ...args: unknown[]) =>
    webContents.getAllWebContents().forEach((w) => w.send(channel, ...args));

  ipcMain.handle(
    'terminal:open',
    (_, cwd: string, cols: number, rows: number) => {
      const existing = shells.get(cwd);
      if (existing) {
        existing.pty.resize(cols, rows);
        return existing.output;
      }
      const pty = spawn(
        process.env.SHELL ??
          (process.platform === 'win32' ? 'powershell.exe' : '/bin/sh'),
        [],
        {
          cwd,
          cols,
          rows,
          name: 'xterm-256color',
          env: { ...process.env, COLORTERM: 'truecolor' },
        },
      );
      const shell = { pty, output: '' };
      shells.set(cwd, shell);
      pty.onData((data) => {
        shell.output = (shell.output + data).slice(-limit);
        broadcast('terminal:data', cwd, data);
      });
      pty.onExit(() => {
        shells.delete(cwd);
        broadcast('terminal:exit', cwd);
      });
      return '';
    },
  );
  ipcMain.on('terminal:write', (_, cwd: string, data: string) =>
    shells.get(cwd)?.pty.write(data),
  );
  ipcMain.on('terminal:close', (_, cwd: string) => shells.get(cwd)?.pty.kill());
  ipcMain.on('terminal:resize', (_, cwd: string, cols: number, rows: number) =>
    shells.get(cwd)?.pty.resize(cols, rows),
  );
  app.on('will-quit', () => shells.forEach((s) => s.pty.kill()));
}
