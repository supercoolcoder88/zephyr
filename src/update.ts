import { app, ipcMain } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

// The `zephyr` launcher from install.sh points this at the clone it was built from.
const source = process.env.ZEPHYR_SOURCE;
const git = (...args: string[]) =>
  promisify(execFile)('git', ['-C', source!, ...args]).then((r) => r.stdout);

export function registerUpdateIpc() {
  // Subjects of the commits upstream that this install doesn't have yet.
  ipcMain.handle('update:check', async (): Promise<string[]> => {
    if (!source) return [];
    await git('fetch', '--quiet');
    const log = await git('log', '--format=%s', 'HEAD..@{u}');
    return log.split('\n').filter(Boolean);
  });

  // install.sh refuses while zephyr runs, so a detached shell waits for this process to exit, then relaunches.
  ipcMain.handle('update:install', () => {
    spawn(
      'bash',
      [
        '-c',
        'while kill -0 "$1" 2>/dev/null; do sleep 0.5; done; git pull --ff-only && ./install.sh; exec "$HOME/.local/bin/zephyr"',
        'update',
        String(process.pid),
      ],
      { cwd: source, detached: true, stdio: 'ignore' },
    ).unref();
    app.quit();
  });
}
