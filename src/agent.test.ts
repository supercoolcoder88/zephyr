// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const sdk = vi.hoisted(() => ({
  listSessions: vi.fn(),
  getSessionMessages: vi.fn(),
  query: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: {},
  dialog: {},
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
  },
}));
vi.mock('@anthropic-ai/claude-agent-sdk', () => sdk);

const invoke = (channel: string, ...args: unknown[]) =>
  handlers.get(channel)!({ sender: {} }, ...args);

beforeAll(async () => {
  const { registerAgentIpc } = await import('./agent');
  registerAgentIpc();
});

beforeEach(() => vi.clearAllMocks());

const session = (
  sessionId: string,
  lastModified: number,
  fields: Record<string, string> = {},
) => ({ sessionId, lastModified, summary: '', ...fields });

describe('threads:list', () => {
  it('lists sessions for the cwd newest first', async () => {
    sdk.listSessions.mockResolvedValue([
      session('a', 1, { summary: 'Old' }),
      session('b', 3, { summary: 'New' }),
      session('c', 2, { summary: 'Mid' }),
    ]);
    expect(await invoke('threads:list', '/proj')).toEqual([
      { id: 'b', title: 'New', updatedAt: 3 },
      { id: 'c', title: 'Mid', updatedAt: 2 },
      { id: 'a', title: 'Old', updatedAt: 1 },
    ]);
    expect(sdk.listSessions).toHaveBeenCalledWith({ dir: '/proj' });
  });

  it('prefers customTitle, then summary, then firstPrompt', async () => {
    sdk.listSessions.mockResolvedValue([
      session('a', 5, {
        customTitle: 'Custom',
        summary: 'S',
        firstPrompt: 'P',
      }),
      session('b', 4, {
        customTitle: '',
        summary: 'Summary',
        firstPrompt: 'P',
      }),
      session('c', 3, { firstPrompt: 'Prompt' }),
      session('d', 2),
      session('e', 1, { summary: `  ${'x'.repeat(60)}  ` }),
    ]);
    const titles = (
      (await invoke('threads:list', '/proj')) as { title: string }[]
    ).map((t) => t.title);
    expect(titles).toEqual([
      'Custom',
      'Summary',
      'Prompt',
      'Untitled',
      'x'.repeat(48),
    ]);
  });
});

const message = (
  type: 'user' | 'assistant' | 'system',
  content: unknown,
  parent_tool_use_id: string | null = null,
) => ({
  type,
  uuid: crypto.randomUUID(),
  session_id: 's',
  parent_tool_use_id,
  parent_agent_id: null,
  message: { role: type, content },
});

describe('threads:load', () => {
  it('loads the session transcript and parses it into items', async () => {
    sdk.getSessionMessages.mockResolvedValue([
      message('user', 'hello'),
      message('assistant', [
        { type: 'thinking', thinking: '...' },
        { type: 'text', text: 'Looking' },
        { type: 'tool_use', id: 't1', name: 'Read', input: { path: 'a' } },
      ]),
      message('user', [
        { type: 'tool_result', tool_use_id: 't1', content: 'x' },
      ]),
      message('assistant', [{ type: 'text', text: 'sub' }], 't1'),
      message('user', [{ type: 'text', text: 'sub prompt' }], 't1'),
      message('system', 'compacted'),
      message('assistant', [{ type: 'text', text: 'Done' }]),
      message('assistant', []),
      message('user', [
        { type: 'text', text: 'line one' },
        { type: 'image', source: {} },
        { type: 'text', text: 'line two' },
      ]),
    ]);
    expect(await invoke('threads:load', 'sid', '/proj')).toEqual([
      { type: 'user', text: 'hello' },
      { type: 'text', text: 'Looking' },
      { type: 'tool', name: 'Read', input: { path: 'a' } },
      { type: 'text', text: 'Done' },
      { type: 'user', text: 'line one\nline two' },
    ]);
    expect(sdk.getSessionMessages).toHaveBeenCalledWith('sid', {
      dir: '/proj',
    });
  });
});

describe('threads:delete', () => {
  it('deletes the session in the cwd', async () => {
    sdk.deleteSession.mockResolvedValue(undefined);
    await expect(
      invoke('threads:delete', 'sid', '/proj'),
    ).resolves.toBeUndefined();
    expect(sdk.deleteSession).toHaveBeenCalledWith('sid', { dir: '/proj' });
  });

  it('treats a missing session as deleted', async () => {
    sdk.deleteSession.mockRejectedValue(
      new Error('Session sid not found in project directory for /proj'),
    );
    await expect(
      invoke('threads:delete', 'sid', '/proj'),
    ).resolves.toBeUndefined();
  });

  it('rejects with any other error', async () => {
    const error = new Error('EACCES: permission denied');
    sdk.deleteSession.mockRejectedValue(error);
    await expect(invoke('threads:delete', 'sid', '/proj')).rejects.toBe(error);
  });
});

describe('agent:run', () => {
  it('still forwards live assistant blocks as events', async () => {
    sdk.query.mockImplementation(async function* () {
      yield { type: 'system', subtype: 'init', session_id: 'sid' };
      yield {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'hi' },
            { type: 'tool_use', id: 't', name: 'Bash', input: { cmd: 'ls' } },
          ],
        },
      };
    });
    const sent: unknown[] = [];
    const sender = {
      id: 1,
      isDestroyed: () => false,
      send: (_: string, event: unknown) => sent.push(event),
    };
    await handlers.get('agent:run')!({ sender }, 'go', '/proj');
    expect(sent).toEqual([
      { type: 'session', sessionId: 'sid' },
      { type: 'text', text: 'hi' },
      { type: 'tool', name: 'Bash', input: { cmd: 'ls' } },
    ]);
  });
});
