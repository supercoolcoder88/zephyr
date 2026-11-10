import { tmpdir } from 'node:os';
import { afterAll, expect, it, vi } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const sent: unknown[][] = [];
let quit: () => void;

vi.mock('electron', () => ({
  app: { on: (_: string, fn: () => void) => (quit = fn) },
  webContents: {
    getAllWebContents: () => [
      { send: (...args: unknown[]) => sent.push(args) },
    ],
  },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) =>
      handlers.set(channel, fn),
    on: (channel: string, fn: (...args: unknown[]) => unknown) =>
      handlers.set(channel, fn),
  },
}));

const { registerTerminalIpc } = await import('./terminal');
registerTerminalIpc();
afterAll(() => quit());

const call = (channel: string, ...args: unknown[]) =>
  handlers.get(channel)!({}, ...args);

it('keeps the workspace shell alive and replays its output on reopen', async () => {
  const cwd = tmpdir();
  expect(await call('terminal:open', cwd, 80, 24)).toBe('');
  call('terminal:write', cwd, 'echo zephyr-$((40+2))\r');
  await vi.waitFor(() =>
    expect(sent.map(([, , data]) => data).join('')).toContain('zephyr-42'),
  );

  expect(await call('terminal:open', cwd, 100, 30)).toContain('zephyr-42');
  call('terminal:write', cwd, 'exit\r');
  await vi.waitFor(() => expect(sent).toContainEqual(['terminal:exit', cwd]));
  expect(await call('terminal:open', cwd, 80, 24)).toBe('');
});
