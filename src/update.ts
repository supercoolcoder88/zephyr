import { app, ipcMain } from 'electron';
import { execFile, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { UpdateStatus } from './agent-types';

// The `zephyr` launcher from install.sh points these at the clone and the commit it was built from.
const source = process.env.ZEPHYR_SOURCE;
const built = process.env.ZEPHYR_COMMIT ?? 'HEAD';
const log = path.join(os.tmpdir(), 'zephyr-update.log');
const git = (...args: string[]) =>
  promisify(execFile)('git', ['-C', source!, ...args], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: 15000,
  }).then((r) => r.stdout.trim());
const upstream = () =>
  git('rev-parse', '--verify', '-q', '@{u}').then(
    () => true,
    () => false,
  );

export function registerUpdateIpc() {
  // Commits in the clone, local or upstream, that this build doesn't have yet.
  ipcMain.handle('update:check', async (): Promise<UpdateStatus> => {
    const error =
      process.env.ZEPHYR_UPDATE_FAILED && `Update failed, see ${log}`;
    if (!source) return { commits: [], error };
    const remote = await upstream();
    if (remote) await git('fetch', '--quiet').catch(() => {});
    const subjects = await git(
      'log',
      '--format=%s',
      `^${built}`,
      'HEAD',
      ...(remote ? ['@{u}'] : []),
    );
    return { commits: subjects.split('\n').filter(Boolean), error };
  });

  // Pulls here so a failure can be shown; install.sh refuses while zephyr runs, so a detached shell waits for every zephyr process to exit.
  ipcMain.handle('update:install', async (_e, workspace: string) => {
    if ((await upstream()) && (await git('rev-list', 'HEAD..@{u}')))
      try {
        await git('pull', '--ff-only', '--quiet');
      } catch (e) {
        return (e as { stderr?: string }).stderr?.trim() || String(e);
      }
    spawn(
      'bash',
      [
        '-c',
        'while pgrep -f "$APP" >/dev/null; do sleep 0.5; done; ./install.sh >"$LOG" 2>&1 || export ZEPHYR_UPDATE_FAILED=1; exec "$HOME/.local/bin/zephyr" "$1"',
        'update',
        workspace,
      ],
      {
        cwd: source,
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          APP: process.execPath,
          LOG: log,
          ZEPHYR_UPDATE_FAILED: undefined,
        },
      },
    ).unref();
    app.quit();
  });
}
