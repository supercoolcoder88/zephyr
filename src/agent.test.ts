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
      { id: 'b', title: 'New', createdAt: 3, updatedAt: 3 },
      { id: 'c', title: 'Mid', createdAt: 2, updatedAt: 2 },
      { id: 'a', title: 'Old', createdAt: 1, updatedAt: 1 },
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
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'AAA' },
        },
        { type: 'text', text: 'line two' },
      ]),
    ]);
    expect(await invoke('threads:load', 'sid', '/proj')).toEqual([
      { type: 'user', text: 'hello' },
      { type: 'text', text: 'Looking' },
      { type: 'tool', id: 't1', name: 'Read', input: { path: 'a' } },
      { type: 'text', text: 'Done' },
      {
        type: 'user',
        text: 'line one\nline two',
        images: [{ mediaType: 'image/png', data: 'AAA' }],
      },
    ]);
    expect(sdk.getSessionMessages).toHaveBeenCalledWith('sid', {
      dir: '/proj',
    });
  });

  it('restores answers to questions from the stored result text', async () => {
    const input = {
      questions: [{ question: 'Theme?' }, { question: 'Features?' }],
    };
    sdk.getSessionMessages.mockResolvedValue([
      message('assistant', [
        { type: 'tool_use', id: 'q', name: 'AskUserQuestion', input },
      ]),
      message('user', [
        {
          type: 'tool_result',
          tool_use_id: 'q',
          content:
            'The user answered: "Theme?"="Dark", "Features?"="Caching, Rust, obviously". Read the answers carefully.',
        },
      ]),
    ]);
    expect(await invoke('threads:load', 'sid', '/proj')).toEqual([
      {
        type: 'tool',
        id: 'q',
        name: 'AskUserQuestion',
        input: {
          ...input,
          answers: {
            'Theme?': 'Dark',
            'Features?': 'Caching, Rust, obviously',
          },
        },
      },
    ]);
  });

  it('shows saved slash commands as typed and hides injected messages', async () => {
    sdk.getSessionMessages.mockResolvedValue([
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
      { type: 'user', text: '/deslop the repo' },
      { type: 'user', text: '/clear' },
      { type: 'user', text: '<b>bold</b> is fine' },
    ]);
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
  const destroyed: (() => void)[] = [];
  return {
    sent,
    destroy: () => destroyed.forEach((f) => f()),
    target: {
      isDestroyed: () => false,
      once: (_: string, f: () => void) => destroyed.push(f),
      off: vi.fn(),
      send: (_: string, runId: string, event: unknown) =>
        sent.push([runId, event]),
    },
  };
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

  it('starts one streaming query and pushes each message into it', async () => {
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
    expect(sdk.query).toHaveBeenCalledTimes(1);
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
  });

  it('switches model and effort on the live session when the choice changes', async () => {
    const s = sender();
    await send(s, 's2', 'a', { model: 'opus', effort: 'high' });
    const q = lastQuery();
    await send(s, 's2', 'b', { model: 'sonnet', effort: 'high' });
    expect(q.setModel).toHaveBeenCalledWith('sonnet');
    expect(q.applyFlagSettings).not.toHaveBeenCalled();
    await send(s, 's2', 'c', { model: 'sonnet', effort: 'low' });
    expect(q.applyFlagSettings).toHaveBeenCalledWith({ effortLevel: 'low' });
    expect(q.setModel).toHaveBeenCalledTimes(1);
    expect(sdk.query).toHaveBeenCalledTimes(1);
  });

  it('interrupts the turn and keeps the session live', async () => {
    const s = sender();
    await send(s, 's3', 'a');
    const q = lastQuery();
    await handlers.get('agent:interrupt')!({}, 's3');
    expect(q.interrupt).toHaveBeenCalledWith({ cancelQueued: true });
    await send(s, 's3', 'b');
    expect(sdk.query).toHaveBeenCalledTimes(1);
    await expect(handlers.get('agent:interrupt')!({}, 'none')).resolves.toBe(
      undefined,
    );
  });

  it('reads usage from the thread session after a reply without starting a CLI', async () => {
    const s = sender();
    await send(s, 'u1', 'go');
    lastQuery().step({
      value: {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'ok',
      },
    });
    await vi.waitFor(async () =>
      expect(await invoke('agent:usage')).toEqual([
        { label: '5 hour', utilization: 40, resetsAt: null },
      ]),
    );
    expect(sdk.query).toHaveBeenCalledTimes(1);
  });

  it('forwards session, blocks, subagent traffic and session state', async () => {
    const s = sender();
    await send(s, 's4', 'go');
    const q = lastQuery();
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
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'ok',
      },
      { type: 'system', subtype: 'session_state_changed', state: 'idle' },
    ])
      q.step({ value });
    await vi.waitFor(() => expect(s.sent).toHaveLength(11));
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
      ['s4', { type: 'done', ok: true, result: 'ok' }],
      ['s4', { type: 'state', state: 'idle' }],
    ]);
  });

  it("forwards the user's answers to a question", async () => {
    const s = sender();
    await send(s, 's8', 'go');
    const answers = { 'Which?': 'Left, of course' };
    lastQuery().step({
      value: {
        type: 'user',
        parent_tool_use_id: null,
        message: { content: [{ type: 'tool_result', tool_use_id: 'q' }] },
        tool_use_result: { questions: [], answers },
      },
    });
    await vi.waitFor(() =>
      expect(s.sent).toContainEqual([
        's8',
        { type: 'answers', id: 'q', answers },
      ]),
    );
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

  it('closes a session without reporting an error', async () => {
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
  });

  it('starts sessions in the chosen permission mode', async () => {
    const s = sender();
    await send(s, 'p1', 'a');
    expect(sdk.query.mock.lastCall![0].options).toMatchObject({
      permissionMode: 'default',
      allowDangerouslySkipPermissions: true,
      canUseTool: expect.any(Function),
    });
    await send(s, 'p2', 'a', { model: 'opus' }, [], undefined, 'auto');
    expect(sdk.query.mock.lastCall![0].options).toMatchObject({
      permissionMode: 'auto',
      allowDangerouslySkipPermissions: true,
    });
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
    expect(s.sent.at(-1)).toEqual(['p3', { type: 'permission-end', id: 'r2' }]);
  });

  it("allows a question with the user's answers added to its input", async () => {
    await send(sender(), 'p6', 'a');
    const input = { questions: [{ question: 'Which?' }] };
    const asked = ask(input, 'r1');
    await answer('p6', 'r1', true, { 'Which?': 'Left' });
    await expect(asked.result).resolves.toEqual({
      behavior: 'allow',
      updatedInput: { ...input, answers: { 'Which?': 'Left' } },
    });
  });

  it('denies a pending tool call when it is aborted or the session closes', async () => {
    const s = sender();
    await send(s, 'p4', 'a');
    const aborted = ask({}, 'r1');
    aborted.controller.abort();
    await expect(aborted.result).resolves.toMatchObject({ behavior: 'deny' });
    expect(s.sent.at(-1)).toEqual(['p4', { type: 'permission-end', id: 'r1' }]);

    const closed = ask({}, 'r2');
    await handlers.get('agent:close')!({}, 'p4');
    await expect(closed.result).resolves.toMatchObject({ behavior: 'deny' });
  });

  it('switches the permission mode of the live session', async () => {
    const s = sender();
    await send(s, 'p5', 'a');
    const q = lastQuery();
    const set = (runId: string, permission: string) =>
      handlers.get('agent:set-permission')!({}, runId, permission);
    await set('p5', 'auto');
    expect(q.setPermissionMode).toHaveBeenLastCalledWith('auto');
    await send(s, 'p5', 'b', { model: 'opus' }, [], undefined, 'auto');
    expect(q.setPermissionMode).toHaveBeenCalledTimes(1);
    await send(s, 'p5', 'c', { model: 'opus' }, [], undefined, 'plan');
    expect(q.setPermissionMode).toHaveBeenLastCalledWith('plan');
    await set('p5', 'plan');
    expect(q.setPermissionMode).toHaveBeenCalledTimes(2);
    expect(sdk.query).toHaveBeenCalledTimes(1);
    await expect(set('none', 'auto')).resolves.toBeUndefined();
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

    it('closes a session once it has been idle for the timeout', async () => {
      const s = sender();
      await send(s, 'i1', 'a');
      const q = lastQuery();
      state(q, 'idle');
      await flush();
      vi.advanceTimersByTime(IDLE_MS - 1);
      expect(q.close).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(q.close).toHaveBeenCalledTimes(1);
      await flush();
      expect(s.sent.map(([, e]) => e)).toEqual([
        { type: 'state', state: 'idle' },
        { type: 'end' },
      ]);
    });

    it('restarts the timeout after a send', async () => {
      const s = sender();
      await send(s, 'i2', 'a');
      const q = lastQuery();
      state(q, 'idle');
      await flush();
      vi.advanceTimersByTime(IDLE_MS - 1);
      await send(s, 'i2', 'b');
      vi.advanceTimersByTime(IDLE_MS);
      expect(q.close).not.toHaveBeenCalled();
      state(q, 'idle');
      await flush();
      vi.advanceTimersByTime(IDLE_MS);
      expect(q.close).toHaveBeenCalledTimes(1);
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

    it('resumes the conversation in a new process after a timeout', async () => {
      const s = sender();
      await send(s, 'i4', 'a');
      state(lastQuery(), 'idle');
      await flush();
      vi.advanceTimersByTime(IDLE_MS);
      await flush();
      await send(s, 'i4', 'b', { model: 'opus' }, [], 'sid');
      expect(sdk.query).toHaveBeenCalledTimes(2);
      expect(sdk.query.mock.lastCall![0].options.resume).toBe('sid');
    });

    const startIdle = async (
      s: ReturnType<typeof sender>,
      runIds: string[],
    ) => {
      const queries: FakeQuery[] = [];
      for (const runId of runIds) {
        await send(s, runId, 'a');
        queries.push(lastQuery());
        state(lastQuery(), 'idle');
        await flush();
        vi.advanceTimersByTime(1);
      }
      return queries;
    };

    it('closes the least recently used idle session past the cap', async () => {
      const s = sender();
      const [c1, c2, c3, c4] = await startIdle(s, ['c1', 'c2', 'c3', 'c4']);
      await send(s, 'c5', 'a');
      expect(c1.close).toHaveBeenCalled();
      for (const q of [c2, c3, c4]) expect(q.close).not.toHaveBeenCalled();
      expect(sdk.query).toHaveBeenCalledTimes(5);
    });

    it('picks the cap victim by last use, not start order', async () => {
      const s = sender();
      const [c1, c2, c3, c4] = await startIdle(s, ['l1', 'l2', 'l3', 'l4']);
      await send(s, 'l1', 'b');
      state(c1, 'idle');
      await flush();
      vi.advanceTimersByTime(1);
      await send(s, 'l5', 'a');
      expect(c2.close).toHaveBeenCalled();
      for (const q of [c1, c3, c4]) expect(q.close).not.toHaveBeenCalled();
    });

    it('starts past the cap without closing busy sessions', async () => {
      const s = sender();
      const queries: FakeQuery[] = [];
      for (const runId of ['b1', 'b2', 'b3', 'b4']) {
        await send(s, runId, 'a');
        queries.push(lastQuery());
      }
      await send(s, 'b5', 'a');
      for (const q of queries) expect(q.close).not.toHaveBeenCalled();
      expect(sdk.query).toHaveBeenCalledTimes(5);
    });
  });

  it("closes a sender's sessions when it is destroyed", async () => {
    const s = sender();
    await send(s, 's7', 'a');
    const first = lastQuery();
    await send(s, 's8', 'a');
    const second = lastQuery();
    s.destroy();
    expect(first.close).toHaveBeenCalled();
    expect(second.close).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(s.sent).toEqual([
        ['s7', { type: 'end' }],
        ['s8', { type: 'end' }],
      ]),
    );
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

    await rm(path.join(user, 'skills', 'mine'), { recursive: true });
    const later = await invoke('agent:catalog', path.join(root, 'other'));
    expect(later).toEqual({
      commands: [{ name: 'compact', description: 'Compact', argumentHint: '' }],
      models: [],
    });
    expect(sdk.query).toHaveBeenCalledTimes(1);
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
