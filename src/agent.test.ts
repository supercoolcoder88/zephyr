// @vitest-environment node
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { EventEmitter } from 'node:events';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const sdk = vi.hoisted(() => ({
  listSessions: vi.fn(),
  getSessionMessages: vi.fn(),
  query: vi.fn(),
  deleteSession: vi.fn(),
}));
const send = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: { getAllWindows: () => [{ webContents: { send } }] },
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

it('lists sessions newest first, titled by custom title, summary or first prompt', async () => {
  sdk.listSessions.mockResolvedValue([
    session('a', 1, { customTitle: '', summary: 'Summary', firstPrompt: 'P' }),
    session('b', 5, { customTitle: 'Custom', summary: 'S', firstPrompt: 'P' }),
    session('c', 3, { firstPrompt: 'Prompt' }),
    session('d', 2),
    session('e', 0, { summary: `  ${'x'.repeat(60)}  ` }),
  ]);
  expect(await invoke('threads:list', '/proj')).toEqual([
    { id: 'b', title: 'Custom', createdAt: 5, updatedAt: 5 },
    { id: 'c', title: 'Prompt', createdAt: 3, updatedAt: 3 },
    { id: 'd', title: 'Untitled', createdAt: 2, updatedAt: 2 },
    { id: 'a', title: 'Summary', createdAt: 1, updatedAt: 1 },
    { id: 'e', title: 'x'.repeat(48), createdAt: 0, updatedAt: 0 },
  ]);
  expect(sdk.listSessions).toHaveBeenCalledWith({ dir: '/proj' });
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

it('loads a transcript into items, restoring answers and hiding injected messages', async () => {
  const questions = [{ question: 'Theme?' }, { question: 'Features?' }];
  sdk.getSessionMessages.mockResolvedValue([
    message('user', 'hello'),
    message('assistant', [
      { type: 'thinking', thinking: '...' },
      { type: 'text', text: 'Looking' },
      { type: 'tool_use', id: 't1', name: 'Read', input: { path: 'a' } },
    ]),
    message('user', [{ type: 'tool_result', tool_use_id: 't1', content: 'x' }]),
    message('assistant', [{ type: 'text', text: 'sub' }], 't1'),
    message('user', [{ type: 'text', text: 'sub prompt' }], 't1'),
    message('system', 'compacted'),
    message('assistant', [
      {
        type: 'tool_use',
        id: 'q',
        name: 'AskUserQuestion',
        input: { questions },
      },
    ]),
    message('user', [
      {
        type: 'tool_result',
        tool_use_id: 'q',
        content:
          'The user answered: "Theme?"="Dark", "Features?"="Caching, Rust, obviously". Read the answers carefully.',
      },
    ]),
    message('assistant', [{ type: 'text', text: 'Done' }]),
    message('assistant', []),
    message('user', [
      { type: 'text', text: 'line one' },
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'AAA' },
      },
      { type: 'text', text: 'line two' },
    ]),
    message(
      'user',
      '<command-message>deslop</command-message>\n<command-name>/deslop</command-name>\n<command-args>the repo</command-args>',
    ),
    message(
      'user',
      '<command-name>/clear</command-name>\n<command-message>clear</command-message>\n<command-args></command-args>',
    ),
    message('user', '<local-command-stdout>Cleared</local-command-stdout>'),
    message('user', [
      {
        type: 'text',
        text: '<task-notification>\n<task-id>a1</task-id>\n</task-notification>',
      },
    ]),
    message('user', '<agent-message from="a1">report</agent-message>'),
    message('user', '<b>bold</b> is fine'),
  ]);
  expect(await invoke('threads:load', 'sid', '/proj')).toEqual([
    { type: 'user', text: 'hello' },
    { type: 'text', text: 'Looking' },
    { type: 'tool', id: 't1', name: 'Read', input: { path: 'a' } },
    {
      type: 'tool',
      id: 'q',
      name: 'AskUserQuestion',
      input: {
        questions,
        answers: { 'Theme?': 'Dark', 'Features?': 'Caching, Rust, obviously' },
      },
    },
    { type: 'text', text: 'Done' },
    {
      type: 'user',
      text: 'line one\nline two',
      images: [{ mediaType: 'image/png', data: 'AAA' }],
    },
    { type: 'user', text: '/deslop the repo' },
    { type: 'user', text: '/clear' },
    { type: 'user', text: '<b>bold</b> is fine' },
  ]);
  expect(sdk.getSessionMessages).toHaveBeenCalledWith('sid', { dir: '/proj' });
});

it('deletes a session, treating a missing one as deleted', async () => {
  sdk.deleteSession.mockResolvedValueOnce(undefined);
  await expect(
    invoke('threads:delete', 'sid', '/proj'),
  ).resolves.toBeUndefined();
  expect(sdk.deleteSession).toHaveBeenCalledWith('sid', { dir: '/proj' });
  sdk.deleteSession.mockRejectedValueOnce(
    new Error('Session sid not found in project directory for /proj'),
  );
  await expect(
    invoke('threads:delete', 'sid', '/proj'),
  ).resolves.toBeUndefined();
  const error = new Error('EACCES: permission denied');
  sdk.deleteSession.mockRejectedValueOnce(error);
  await expect(invoke('threads:delete', 'sid', '/proj')).rejects.toBe(error);
});

it('gives a thread its own ignored worktree and removes it on delete, keeping the branch', async () => {
  const { execFileSync } = await import('node:child_process');
  const { existsSync } = await import('node:fs');
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const repo = await mkdtemp(path.join(tmpdir(), 'zephyr-git-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git(
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  );
  expect(await invoke('git:branch', repo)).toBe('main');
  expect(await invoke('git:branch', tmpdir())).toBeNull();

  const tree = path.join(repo, '.zephyr', 'worktrees', 'abc');
  expect(await invoke('git:worktree', repo, 'abc')).toEqual({
    path: tree,
    branch: 'zephyr/abc',
  });
  expect(await invoke('git:branch', tree)).toBe('zephyr/abc');
  expect(git('status', '--porcelain')).toBe('');

  await writeFile(path.join(tree, 'wip.txt'), 'x');
  await expect(invoke('threads:delete', 'sid', repo, tree)).rejects.toThrow(
    /untracked/,
  );
  expect(sdk.deleteSession).not.toHaveBeenCalled();
  git('-C', tree, 'add', '.');
  git(
    '-C',
    tree,
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-q',
    '-m',
    'wip',
  );
  sdk.deleteSession.mockResolvedValueOnce(undefined);
  await invoke('threads:delete', 'sid', repo, tree);
  expect(existsSync(tree)).toBe(false);
  expect(git('branch', '--list', 'zephyr/abc')).toContain('zephyr/abc');
  expect(sdk.deleteSession).toHaveBeenCalledWith('sid', { dir: tree });
});

it('sets a worktree up with its env and setup command, then squash merges its work and removes it', async () => {
  const { execFileSync } = await import('node:child_process');
  const { existsSync } = await import('node:fs');
  const { mkdtemp, readFile, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const repo = await mkdtemp(path.join(tmpdir(), 'zephyr-merge-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 't');
  git('config', 'user.email', 't@t');
  await writeFile(path.join(repo, '.gitignore'), '.env\nnode_modules/\n');
  await writeFile(path.join(repo, 'a.txt'), 'base\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  await writeFile(path.join(repo, '.env'), 'KEY=1');

  const tree = path.join(repo, '.zephyr', 'worktrees', 'm1');
  expect(await invoke('git:setup', repo)).toBeNull();
  expect(
    await invoke('git:worktree', repo, 'm1', 'mkdir node_modules'),
  ).toMatchObject({ setup: { command: 'mkdir node_modules', ok: true } });
  expect(await readFile(path.join(tree, '.env'), 'utf8')).toBe('KEY=1');
  expect(existsSync(path.join(tree, 'node_modules'))).toBe(true);
  expect(git('-C', tree, 'status', '--porcelain')).toBe('');

  await writeFile(path.join(tree, 'a.txt'), 'changed\n');
  await writeFile(path.join(repo, 'staged.txt'), 'x');
  git('add', 'staged.txt');
  await expect(invoke('git:merge', repo, tree, 'Thread title')).rejects.toThrow(
    /staged/,
  );
  git('reset', '-q', 'staged.txt');

  await invoke('git:merge', repo, tree, 'Thread title');
  expect(git('log', '-1', '--format=%s')).toBe('Thread title');
  expect(await readFile(path.join(repo, 'a.txt'), 'utf8')).toBe('changed\n');
  expect(existsSync(tree)).toBe(false);
  expect(git('branch', '--list', 'zephyr/m1')).toBe('');

  const clash = path.join(repo, '.zephyr', 'worktrees', 'm2');
  await writeFile(path.join(repo, 'Cargo.lock'), '');
  expect(await invoke('git:setup', repo)).toBe('cargo fetch');
  expect(
    await invoke('git:worktree', repo, 'm2', 'echo nope >&2; exit 3'),
  ).toMatchObject({ setup: { ok: false, output: 'nope' } });
  await writeFile(path.join(clash, 'a.txt'), 'theirs\n');
  await writeFile(path.join(repo, 'a.txt'), 'ours\n');
  git('commit', '-qam', 'ours');
  await expect(invoke('git:merge', repo, clash, 'Clash')).rejects.toThrow(
    /conflict/i,
  );
  expect(git('status', '--porcelain', '--untracked-files=no')).toBe('');
  expect(existsSync(clash)).toBe(true);
});

type Step = { value: unknown } | { done: true } | { error: Error };

// A controllable stand-in for the SDK Query: tests push what it yields.
function fakeQuery({ prompt }: { prompt: AsyncIterable<unknown> }) {
  const steps: Step[] = [];
  let wake = () => {};
  const q = {
    prompt,
    input: prompt[Symbol.asyncIterator](),
    step(s: Step) {
      steps.push(s);
      wake();
    },
    interrupt: vi.fn(async () => undefined),
    setModel: vi.fn(async () => undefined),
    applyFlagSettings: vi.fn(async () => undefined),
    setPermissionMode: vi.fn(async () => undefined),
    getContextUsage: vi.fn(async () => ({ percentage: 12 })),
    usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: vi.fn(
      async () => ({
        rate_limits: { five_hour: { utilization: 40, resets_at: null } },
      }),
    ),
    close: vi.fn(() => q.step({ error: new Error('aborted') })),
    async *[Symbol.asyncIterator]() {
      while (true) {
        while (!steps.length) await new Promise<void>((r) => (wake = r));
        const s = steps.shift()!;
        if ('error' in s) throw s.error;
        if ('done' in s) return;
        yield s.value;
      }
    },
  };
  return q;
}

type FakeQuery = ReturnType<typeof fakeQuery>;
const lastQuery = () => sdk.query.mock.results.at(-1)!.value as FakeQuery;

function sender() {
  const sent: [string, unknown][] = [];
  const target = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    send: (_: string, runId: string, event: unknown) =>
      sent.push([runId, event]),
  });
  return { sent, target };
}

const userMessage = (content: unknown) => ({
  type: 'user',
  parent_tool_use_id: null,
  message: { role: 'user', content },
});

describe('agent:send', () => {
  const started = new Set<string>();
  beforeEach(() => {
    sdk.query.mockImplementation(fakeQuery);
  });
  afterEach(async () => {
    vi.useRealTimers();
    for (const runId of started) await handlers.get('agent:close')!({}, runId);
    started.clear();
    await new Promise((r) => setTimeout(r));
  });

  const send = (
    s: ReturnType<typeof sender>,
    runId: string,
    prompt: string,
    choice: unknown = { model: 'opus' },
    images: unknown[] = [],
    resume?: string,
    permission = 'default',
  ) =>
    started.add(runId) &&
    handlers.get('agent:send')!(
      { sender: s.target },
      runId,
      prompt,
      images,
      '/proj',
      resume,
      choice,
      permission,
      `uuid-${prompt}`,
    );

  it('keeps one live query per run and updates its model, effort and mode in place', async () => {
    const s = sender();
    await send(s, 's1', 'go', { model: 'sonnet', effort: 'high' }, [], 'sid');
    expect(sdk.query).toHaveBeenCalledTimes(1);
    const { prompt, options } = sdk.query.mock.lastCall![0];
    expect(typeof prompt).not.toBe('string');
    expect(options).toMatchObject({
      cwd: '/proj',
      resume: 'sid',
      model: 'sonnet',
      effort: 'high',
      permissionMode: 'default',
      allowDangerouslySkipPermissions: true,
      canUseTool: expect.any(Function),
      env: { CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1' },
    });
    const q = lastQuery();
    expect((await q.input.next()).value).toEqual({
      ...userMessage('go'),
      uuid: 'uuid-go',
    });

    await send(s, 's1', 'what is this', { model: 'sonnet', effort: 'high' }, [
      { mediaType: 'image/png', data: 'AAA' },
    ]);
    expect((await q.input.next()).value).toEqual({
      ...userMessage([
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'AAA' },
        },
        { type: 'text', text: 'what is this' },
      ]),
      uuid: 'uuid-what is this',
    });
    expect(q.setModel).not.toHaveBeenCalled();
    expect(q.applyFlagSettings).not.toHaveBeenCalled();

    await send(s, 's1', 'b', { model: 'opus', effort: 'high' });
    expect(q.setModel).toHaveBeenCalledWith('opus');
    expect(q.applyFlagSettings).not.toHaveBeenCalled();
    await send(s, 's1', 'c', { model: 'opus', effort: 'low' });
    expect(q.applyFlagSettings).toHaveBeenCalledWith({ effortLevel: 'low' });
    expect(q.setModel).toHaveBeenCalledTimes(1);

    const set = (runId: string, permission: string) =>
      handlers.get('agent:set-permission')!({}, runId, permission);
    await set('s1', 'auto');
    expect(q.setPermissionMode).toHaveBeenLastCalledWith('auto');
    await send(
      s,
      's1',
      'd',
      { model: 'opus', effort: 'low' },
      [],
      undefined,
      'auto',
    );
    expect(q.setPermissionMode).toHaveBeenCalledTimes(1);
    await send(
      s,
      's1',
      'e',
      { model: 'opus', effort: 'low' },
      [],
      undefined,
      'plan',
    );
    expect(q.setPermissionMode).toHaveBeenLastCalledWith('plan');
    await set('s1', 'plan');
    expect(q.setPermissionMode).toHaveBeenCalledTimes(2);
    await expect(set('none', 'auto')).resolves.toBeUndefined();

    await handlers.get('agent:interrupt')!({}, 's1');
    expect(q.interrupt).toHaveBeenCalledWith({ cancelQueued: true });
    await send(s, 's1', 'f', { model: 'opus', effort: 'low' });
    await expect(handlers.get('agent:interrupt')!({}, 'none')).resolves.toBe(
      undefined,
    );
    expect(sdk.query).toHaveBeenCalledTimes(1);

    await send(s, 's2', 'a', { model: 'opus' }, [], undefined, 'auto');
    expect(sdk.query.mock.lastCall![0].options.permissionMode).toBe('auto');
  });

  it('forwards session, blocks, subagent traffic, answers, state and usage', async () => {
    const s = sender();
    await send(s, 's4', 'go');
    const q = lastQuery();
    const answers = { 'Which?': 'Left, of course' };
    for (const value of [
      { type: 'system', subtype: 'init', session_id: 'sid' },
      { type: 'system', subtype: 'session_state_changed', state: 'running' },
      {
        type: 'user',
        isReplay: true,
        parent_tool_use_id: null,
        uuid: 'uuid-go',
      },
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'hi' },
            { type: 'tool_use', id: 't', name: 'Bash', input: { cmd: 'ls' } },
          ],
        },
      },
      {
        type: 'system',
        subtype: 'task_started',
        task_type: 'local_bash',
        tool_use_id: 'b',
        description: 'shell',
      },
      {
        type: 'system',
        subtype: 'task_started',
        task_type: 'local_agent',
        tool_use_id: 't',
        description: 'count files',
      },
      {
        type: 'assistant',
        parent_tool_use_id: 't',
        message: { content: [{ type: 'text', text: 'from subagent' }] },
      },
      { type: 'user', isReplay: true, parent_tool_use_id: 't', uuid: 'sub' },
      {
        type: 'system',
        subtype: 'task_notification',
        tool_use_id: 't',
        status: 'completed',
      },
      {
        type: 'user',
        parent_tool_use_id: null,
        message: { content: [{ type: 'tool_result', tool_use_id: 'q' }] },
        tool_use_result: { questions: [], answers },
      },
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'ok',
      },
      { type: 'system', subtype: 'session_state_changed', state: 'idle' },
    ])
      q.step({ value });
    await vi.waitFor(() => expect(s.sent).toHaveLength(12));
    expect(s.sent).toContainEqual(['s4', { type: 'context', percentage: 12 }]);
    expect(
      s.sent.filter(([, e]) => (e as { type: string }).type !== 'context'),
    ).toEqual([
      ['s4', { type: 'session', sessionId: 'sid' }],
      ['s4', { type: 'state', state: 'running' }],
      ['s4', { type: 'picked', ids: ['uuid-go'] }],
      ['s4', { type: 'text', text: 'hi' }],
      ['s4', { type: 'tool', id: 't', name: 'Bash', input: { cmd: 'ls' } }],
      ['s4', { type: 'subthread', id: 't', title: 'count files' }],
      [
        's4',
        {
          type: 'subthread-output',
          id: 't',
          output: { type: 'text', text: 'from subagent' },
        },
      ],
      ['s4', { type: 'subthread-end', id: 't', ok: true }],
      ['s4', { type: 'answers', id: 'q', answers }],
      ['s4', { type: 'done', ok: true, result: 'ok' }],
      ['s4', { type: 'state', state: 'idle' }],
    ]);
    expect(await invoke('agent:usage')).toEqual([
      { label: '5 hour', utilization: 40, resetsAt: null },
    ]);
    expect(sdk.query).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['finishes', 's5', { done: true } as Step, []],
    [
      'throws',
      's9',
      { error: new Error('process died') } as Step,
      [{ type: 'error', message: 'process died' }],
    ],
  ])('ends the session when the query %s', async (_, runId, step, errors) => {
    const s = sender();
    await send(s, runId, 'a');
    lastQuery().step(step);
    await vi.waitFor(() =>
      expect(s.sent.at(-1)).toEqual([runId, { type: 'end' }]),
    );
    expect(s.sent.map(([, e]) => e)).toEqual([...errors, { type: 'end' }]);
    await send(s, runId, 'b', { model: 'opus' }, [], 'sid');
    expect(sdk.query).toHaveBeenCalledTimes(2);
    expect(sdk.query.mock.lastCall![0].options.resume).toBe('sid');
  });

  it("closes a session quietly, and all of a sender's sessions when it is destroyed", async () => {
    const s = sender();
    await send(s, 's6', 'a');
    const q = lastQuery();
    await q.input.next();
    await handlers.get('agent:close')!({}, 's6');
    expect(q.close).toHaveBeenCalled();
    expect(await q.input.next()).toEqual({ done: true, value: undefined });
    await vi.waitFor(() => expect(s.sent).toEqual([['s6', { type: 'end' }]]));
    await send(s, 's6', 'b');
    expect(sdk.query).toHaveBeenCalledTimes(2);

    const reopened = lastQuery();
    await send(s, 's7', 'a');
    const other = lastQuery();
    s.target.emit('destroyed');
    expect(reopened.close).toHaveBeenCalled();
    expect(other.close).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(s.sent).toEqual([
        ['s6', { type: 'end' }],
        ['s6', { type: 'end' }],
        ['s7', { type: 'end' }],
      ]),
    );
  });

  it.each([
    ['the page reloads', 'did-navigate', true],
    ['the render process crashes', 'render-process-gone', true],
    ['the page navigates within the document', 'did-navigate-in-page', false],
  ])('when %s (%s), closes its sessions: %s', async (_, event, closes) => {
    const s = sender();
    await send(s, 'g1', 'a');
    const waiting = lastQuery();
    const pending = ask({ command: 'ls' }, 'g-r1');
    await send(s, 'g2', 'a');
    const other = lastQuery();
    s.target.emit(event);
    expect(waiting.close).toHaveBeenCalledTimes(closes ? 1 : 0);
    expect(other.close).toHaveBeenCalledTimes(closes ? 1 : 0);
    if (!closes) return;
    await expect(pending.result).resolves.toMatchObject({ behavior: 'deny' });
  });

  const ask = (input: unknown, requestId: string, title?: string) => {
    const controller = new AbortController();
    const result = sdk.query.mock.lastCall![0].options.canUseTool(
      'Bash',
      input,
      {
        signal: controller.signal,
        toolUseID: `tool-${requestId}`,
        requestId,
        title,
      },
    );
    return { controller, result };
  };
  const answer = (
    runId: string,
    id: string,
    allow: boolean,
    answers?: Record<string, string>,
  ) => handlers.get('agent:permission-answer')!({}, runId, id, allow, answers);

  it('asks the renderer before a tool call and resolves with its answer', async () => {
    const s = sender();
    await send(s, 'p3', 'a');
    const input = { command: 'ls' };
    const allowed = ask(input, 'r1', 'Claude wants to run ls');
    expect(s.sent).toEqual([
      [
        'p3',
        {
          type: 'permission',
          request: {
            id: 'r1',
            tool: 'Bash',
            input,
            title: 'Claude wants to run ls',
            toolUseId: 'tool-r1',
          },
        },
      ],
    ]);
    await answer('p3', 'r1', true);
    await expect(allowed.result).resolves.toEqual({
      behavior: 'allow',
      updatedInput: input,
    });
    expect(s.sent.at(-1)).toEqual(['p3', { type: 'permission-end', id: 'r1' }]);

    const denied = ask(input, 'r2');
    await answer('p3', 'r2', false);
    await expect(denied.result).resolves.toEqual({
      behavior: 'deny',
      message: 'The user denied this tool call.',
    });

    const questions = { questions: [{ question: 'Which?' }] };
    const asked = ask(questions, 'r3');
    await answer('p3', 'r3', true, { 'Which?': 'Left' });
    await expect(asked.result).resolves.toEqual({
      behavior: 'allow',
      updatedInput: { ...questions, answers: { 'Which?': 'Left' } },
    });

    const aborted = ask({}, 'r4');
    aborted.controller.abort();
    await expect(aborted.result).resolves.toMatchObject({ behavior: 'deny' });
    expect(s.sent.at(-1)).toEqual(['p3', { type: 'permission-end', id: 'r4' }]);

    const closed = ask({}, 'r5');
    await handlers.get('agent:close')!({}, 'p3');
    await expect(closed.result).resolves.toMatchObject({ behavior: 'deny' });
  });

  describe('idle sessions', () => {
    const IDLE_MS = 10 * 60_000;
    const flush = () => new Promise((r) => setImmediate(r));
    const state = (q: FakeQuery, value: string) =>
      q.step({
        value: {
          type: 'system',
          subtype: 'session_state_changed',
          state: value,
        },
      });

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    });

    it('closes a session idle for the timeout, restarting it on send, and resumes later', async () => {
      const s = sender();
      await send(s, 'i1', 'a');
      const q = lastQuery();
      state(q, 'idle');
      await flush();
      vi.advanceTimersByTime(IDLE_MS - 1);
      await send(s, 'i1', 'b');
      vi.advanceTimersByTime(IDLE_MS);
      expect(q.close).not.toHaveBeenCalled();
      state(q, 'idle');
      await flush();
      vi.advanceTimersByTime(IDLE_MS - 1);
      expect(q.close).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(q.close).toHaveBeenCalledTimes(1);
      await flush();
      expect(s.sent.map(([, e]) => e)).toEqual([
        { type: 'state', state: 'idle' },
        { type: 'state', state: 'idle' },
        { type: 'end' },
      ]);
      await send(s, 'i1', 'c', { model: 'opus' }, [], 'sid');
      expect(sdk.query).toHaveBeenCalledTimes(2);
      expect(sdk.query.mock.lastCall![0].options.resume).toBe('sid');
    });

    it('never closes a running session or one waiting on permission', async () => {
      const s = sender();
      await send(s, 'i3', 'a');
      const q = lastQuery();
      vi.advanceTimersByTime(IDLE_MS * 2);
      state(q, 'idle');
      await flush();
      state(q, 'running');
      await flush();
      vi.advanceTimersByTime(IDLE_MS * 2);
      state(q, 'idle');
      await flush();
      ask({}, 'r1');
      vi.advanceTimersByTime(IDLE_MS * 2);
      state(q, 'requires_action');
      state(q, 'idle');
      await flush();
      vi.advanceTimersByTime(IDLE_MS * 2);
      expect(q.close).not.toHaveBeenCalled();
      await answer('i3', 'r1', true);
      state(q, 'idle');
      await flush();
      vi.advanceTimersByTime(IDLE_MS);
      expect(q.close).toHaveBeenCalledTimes(1);
    });

    it('past the cap, closes the least recently used idle session but never a busy one', async () => {
      const s = sender();
      const queries: FakeQuery[] = [];
      const cap = ['1', '2', '3', '4', '5', '6'];
      for (const n of cap) {
        await send(s, `b${n}`, 'a');
        queries.push(lastQuery());
      }
      await send(s, 'b7', 'a');
      for (const q of queries) expect(q.close).not.toHaveBeenCalled();
      expect(sdk.query).toHaveBeenCalledTimes(7);
      for (const n of [...cap, '7'])
        await handlers.get('agent:close')!({}, `b${n}`);

      const idle = async (runId: string, q?: FakeQuery) => {
        if (!q) await send(s, runId, 'a');
        state(q ?? lastQuery(), 'idle');
        await flush();
        vi.advanceTimersByTime(1);
        return q ?? lastQuery();
      };
      const idles: FakeQuery[] = [];
      for (const n of cap) idles.push(await idle(`l${n}`));
      const [l1, l2, ...rest] = idles;
      await send(s, 'l1', 'b');
      await idle('l1', l1);
      await send(s, 'l7', 'a');
      expect(l2.close).toHaveBeenCalled();
      for (const q of [l1, ...rest]) expect(q.close).not.toHaveBeenCalled();
    });
  });
});

describe('agent:catalog', () => {
  it('starts one CLI per app run and re-reads skills from disk each time', async () => {
    const { mkdtemp, mkdir, rm, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const root = await mkdtemp(path.join(tmpdir(), 'zephyr-'));
    const user = path.join(root, 'user');
    const proj = path.join(root, 'proj');
    process.env.CLAUDE_CONFIG_DIR = user;
    await mkdir(path.join(user, 'skills', 'mine'), { recursive: true });
    await writeFile(
      path.join(user, 'skills', 'mine', 'SKILL.md'),
      '---\nname: mine\ndescription: >\n  User\n  skill\n---\nbody',
    );
    await mkdir(path.join(proj, '.claude', 'commands', 'git'), {
      recursive: true,
    });
    await writeFile(
      path.join(proj, '.claude', 'commands', 'git', 'ship.md'),
      '---\nargument-hint: <branch>\n---\nShip it\n',
    );
    const close = vi.fn();
    sdk.query.mockReturnValueOnce({
      supportedCommands: async () => [
        {
          name: 'compact',
          description: 'Compact',
          argumentHint: '',
          builtin: true,
        },
        { name: 'mine', description: 'From startup', argumentHint: '' },
      ],
      supportedModels: async () => [],
      close,
    });

    const first = await invoke('agent:catalog', proj);
    expect(first).toEqual({
      commands: [
        { name: 'compact', description: 'Compact', argumentHint: '' },
        { name: 'git:ship', description: 'Ship it', argumentHint: '<branch>' },
        { name: 'mine', description: 'User skill', argumentHint: '' },
      ],
      models: [],
    });
    expect(close).toHaveBeenCalled();
    expect(sdk.query.mock.lastCall![0].options.permissionMode).toBe('default');

    const other = path.join(root, 'other');
    await rm(path.join(user, 'skills', 'mine'), { recursive: true });
    const later = await invoke('agent:catalog', other);
    expect(later).toEqual({
      commands: [{ name: 'compact', description: 'Compact', argumentHint: '' }],
      models: [],
    });
    expect(sdk.query).toHaveBeenCalledTimes(1);

    // The user skill removed above concerns every workspace; a project command only its own.
    await vi.waitFor(() =>
      expect(send.mock.calls).toEqual([
        ['agent:catalog-change', proj],
        ['agent:catalog-change', other],
      ]),
    );
    send.mockClear();
    await writeFile(path.join(proj, '.claude', 'commands', 'new.md'), 'New\n');
    await vi.waitFor(() =>
      expect(send.mock.calls).toEqual([['agent:catalog-change', proj]]),
    );
  });
});

describe('workspace:complete', () => {
  it('only suggests entries inside the project', async () => {
    const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const root = await mkdtemp(path.join(tmpdir(), 'zephyr-'));
    const proj = path.join(root, 'proj');
    await mkdir(path.join(proj, 'src'), { recursive: true });
    await writeFile(path.join(proj, 'src', 'a.ts'), '');
    await writeFile(path.join(root, 'secret.txt'), '');

    expect(await invoke('workspace:complete', proj, 's')).toEqual(['src/']);
    expect(await invoke('workspace:complete', proj, 'src/')).toEqual([
      'src/a.ts',
    ]);
    expect(await invoke('workspace:complete', proj, 'src/../src/')).toEqual([
      'src/../src/a.ts',
    ]);
    for (const partial of ['../', '../../', '~/', `${root}/`, '/'])
      expect(await invoke('workspace:complete', proj, partial)).toEqual([]);
  });
});
