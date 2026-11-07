import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import type { AgentEvent } from './agent-types';

type User = ReturnType<typeof userEvent.setup>;

let listener: (runId: string, event: AgentEvent) => void;
const finishers = new Map<string, () => void>();
const lastRunId = () => agent.run.mock.lastCall![0] as string;
const emit = (event: AgentEvent, runId = lastRunId()) => listener(runId, event);
const finishRun = (runId = lastRunId()) => finishers.get(runId)!();
const agent = {
  run: vi.fn(),
  pickWorkspace: vi.fn(),
  cancel: vi.fn(),
  onEvent: vi.fn(),
  listThreads: vi.fn(),
  loadThread: vi.fn(),
  deleteThread: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  agent.pickWorkspace.mockResolvedValue('/proj');
  agent.listThreads.mockResolvedValue([]);
  agent.loadThread.mockResolvedValue([]);
  agent.deleteThread.mockResolvedValue(undefined);
  agent.run.mockImplementation(
    (runId: string) =>
      new Promise<void>((resolve) => finishers.set(runId, resolve)),
  );
  agent.onEvent.mockImplementation((l) => {
    listener = l;
    return () => undefined;
  });
  window.agent = agent;
  Element.prototype.scrollIntoView = () => undefined;
});

const list = [
  { id: 'b', title: 'Newest', updatedAt: 2 },
  { id: 'a', title: 'Older', updatedAt: 1 },
];

const sidebarTitles = () =>
  within(screen.getByRole('navigation'))
    .getAllByRole('button')
    .map((b) => b.textContent)
    .filter((t) => !/^\[ (DEL|CONFIRM) \]$/.test(t ?? ''));

const heading = () => screen.getByRole('heading', { level: 1 }).textContent;

const row = (title: RegExp) =>
  within(screen.getByRole('button', { name: title }).parentElement!);

async function open() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: '[ OPEN PROJECT ]' }));
  await screen.findByRole('navigation');
  return user;
}

async function sendPrompt(user: User, text: string) {
  await user.type(
    screen.getByPlaceholderText('Ask the agent…'),
    `${text}{Enter}`,
  );
}

it('lists sessions on open and loads the newest', async () => {
  agent.listThreads.mockResolvedValue(list);
  agent.loadThread.mockResolvedValue([
    { type: 'user', text: 'old prompt' },
    { type: 'text', text: 'old answer' },
    { type: 'tool', name: 'Read', input: { file_path: 'x.ts' } },
    { type: 'text', text: 'final answer' },
  ]);
  await open();
  expect(agent.listThreads).toHaveBeenCalledWith('/proj');
  expect(sidebarTitles()).toEqual(['Newest', 'Older']);
  expect(heading()).toBe('Newest');
  expect(agent.loadThread).toHaveBeenCalledWith('b', '/proj');
  expect(await screen.findByText('final answer')).toBeInTheDocument();
  expect(screen.getByText('old prompt')).toBeInTheDocument();
  expect(screen.queryByText('old answer')).toBeNull();
  expect(screen.queryByText('x.ts')).toBeNull();
  expect(screen.getByRole('button', { name: '[ 2 HIDDEN ]' })).toBeTruthy();
});

it('shows one empty draft when the project has no sessions', async () => {
  await open();
  expect(sidebarTitles()).toEqual(['New thread']);
  expect(screen.getByText('NO MESSAGES YET')).toBeInTheDocument();
  expect(agent.loadThread).not.toHaveBeenCalled();
});

it('loads a thread only the first time it is selected', async () => {
  agent.listThreads.mockResolvedValue(list);
  agent.loadThread.mockImplementation(async (id: string) => [
    { type: 'text', text: `body ${id}` },
  ]);
  const user = await open();
  await screen.findByText('body b');
  await user.click(screen.getByRole('button', { name: /Older/ }));
  expect(await screen.findByText('body a')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Newest/ }));
  await user.click(screen.getByRole('button', { name: /Older/ }));
  expect(screen.getByText('body a')).toBeInTheDocument();
  expect(agent.loadThread).toHaveBeenCalledTimes(2);
  expect(agent.loadThread.mock.calls.filter(([id]) => id === 'a')).toHaveLength(
    1,
  );
});

it('shows a load failure in the chat', async () => {
  agent.listThreads.mockResolvedValue(list);
  agent.loadThread.mockRejectedValue(new Error('transcript missing'));
  await open();
  expect(await screen.findByText('transcript missing')).toBeInTheDocument();
});

it('resumes the session when sending in a loaded thread', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  await sendPrompt(user, 'continue');
  expect(agent.run).toHaveBeenCalledWith(
    expect.any(String),
    'continue',
    '/proj',
    'b',
  );
});

it('starts a fresh session when sending in a draft', async () => {
  const user = await open();
  await sendPrompt(user, 'start');
  expect(agent.run).toHaveBeenCalledWith(
    expect.any(String),
    'start',
    '/proj',
    undefined,
  );
});

it('sends on Enter and inserts a newline on Shift+Enter', async () => {
  const user = await open();
  await user.type(
    screen.getByPlaceholderText('Ask the agent…'),
    'line one{Shift>}{Enter}{/Shift}line two{Enter}',
  );
  expect(agent.run).toHaveBeenCalledWith(
    expect.any(String),
    'line one\nline two',
    '/proj',
    undefined,
  );
});

it('focuses the composer when starting a new thread', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  const composer = () => screen.getByPlaceholderText('Ask the agent…');
  await user.click(screen.getByRole('button', { name: '[ + NEW ]' }));
  expect(composer()).toHaveFocus();
  await user.click(screen.getByRole('button', { name: '[ + NEW ]' }));
  expect(composer()).toHaveFocus();
});

it('swaps a draft to its session id and refreshes the list after the run', async () => {
  agent.listThreads.mockResolvedValueOnce(list);
  agent.loadThread.mockResolvedValue([{ type: 'text', text: 'old answer' }]);
  const user = await open();
  await user.click(screen.getByRole('button', { name: '[ + NEW ]' }));
  expect(heading()).toBe('New thread');
  await sendPrompt(user, 'first prompt');
  expect(agent.run).toHaveBeenLastCalledWith(
    expect.any(String),
    'first prompt',
    '/proj',
    undefined,
  );

  act(() => emit({ type: 'session', sessionId: 'sid' }));
  act(() => emit({ type: 'text', text: 'live answer' }));
  act(() =>
    emit({
      type: 'done',
      ok: true,
      result: 'ok',
      costUsd: 0.01,
      inputTokens: 0,
      outputTokens: 0,
    }),
  );
  expect(screen.getByText('live answer')).toBeInTheDocument();
  expect(heading()).toBe('first prompt');

  agent.listThreads.mockResolvedValueOnce([
    { id: 'sid', title: 'Summarised title', updatedAt: 3 },
    ...list,
  ]);
  await act(async () => finishRun());
  expect(agent.listThreads).toHaveBeenCalledTimes(2);
  expect(sidebarTitles()).toEqual(['Summarised title', 'Newest', 'Older']);
  expect(heading()).toBe('Summarised title');
  expect(screen.getByText('live answer')).toBeInTheDocument();
  expect(screen.getByText(/DONE/)).toBeInTheDocument();
  expect(agent.loadThread).not.toHaveBeenCalledWith('sid', '/proj');

  await sendPrompt(user, 'second prompt');
  expect(agent.run).toHaveBeenLastCalledWith(
    expect.any(String),
    'second prompt',
    '/proj',
    'sid',
  );
});

it('shows no delete control on the running thread', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  expect(row(/Newest/).getByRole('button', { name: '[ DEL ]' })).toBeTruthy();
  expect(row(/Older/).getByRole('button', { name: '[ DEL ]' })).toBeTruthy();
  await sendPrompt(user, 'go');
  expect(row(/Newest/).queryByRole('button', { name: '[ DEL ]' })).toBeNull();
  expect(row(/Older/).getByRole('button', { name: '[ DEL ]' })).toBeTruthy();
});

it('runs threads concurrently and routes events by run', async () => {
  agent.listThreads.mockResolvedValue(list);
  agent.loadThread.mockResolvedValue([]);
  const user = await open();
  await sendPrompt(user, 'first');
  const runB = lastRunId();
  await user.click(screen.getByRole('button', { name: /Older/ }));
  await sendPrompt(user, 'second');
  const runA = lastRunId();
  expect(runA).not.toBe(runB);
  expect(agent.run).toHaveBeenLastCalledWith(runA, 'second', '/proj', 'a');

  act(() => emit({ type: 'text', text: 'answer b' }, runB));
  act(() => emit({ type: 'text', text: 'answer a' }, runA));
  expect(screen.getByText('answer a')).toBeInTheDocument();
  expect(screen.queryByText('answer b')).toBeNull();

  await user.click(screen.getByRole('button', { name: '[ STOP ]' }));
  expect(agent.cancel).toHaveBeenCalledWith(runA);

  await act(async () => finishRun(runA));
  expect(screen.getByText('IDLE')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Newest/ }));
  expect(screen.getByText('answer b')).toBeInTheDocument();
  expect(screen.getByText('RUNNING')).toBeInTheDocument();
});

it('asks for confirmation before deleting', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  await user.click(row(/Older/).getByRole('button', { name: '[ DEL ]' }));
  expect(agent.deleteThread).not.toHaveBeenCalled();
  expect(sidebarTitles()).toEqual(['Newest', 'Older']);
  await user.click(row(/Older/).getByRole('button', { name: '[ CONFIRM ]' }));
  expect(agent.deleteThread).toHaveBeenCalledWith('a', '/proj');
  expect(sidebarTitles()).toEqual(['Newest']);
  expect(heading()).toBe('Newest');
});

it.each([
  [
    'the pointer leaves the row',
    (user: User) => user.hover(screen.getByRole('button', { name: /Newest/ })),
  ],
  ['Escape is pressed', (user: User) => user.keyboard('{Escape}')],
  [
    'focus leaves the row',
    (user: User) =>
      user.click(screen.getByRole('button', { name: '[ + NEW ]' })),
  ],
])('cancels the confirmation when %s', async (_, cancel) => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  await user.click(row(/Older/).getByRole('button', { name: '[ DEL ]' }));
  expect(
    row(/Older/).getByRole('button', { name: '[ CONFIRM ]' }),
  ).toBeTruthy();
  await cancel(user);
  expect(row(/Older/).getByRole('button', { name: '[ DEL ]' })).toBeTruthy();
  expect(
    row(/Older/).queryByRole('button', { name: '[ CONFIRM ]' }),
  ).toBeNull();
  expect(agent.deleteThread).not.toHaveBeenCalled();
});

async function remove(user: User, title: RegExp) {
  await user.click(row(title).getByRole('button', { name: '[ DEL ]' }));
  await user.click(row(title).getByRole('button', { name: '[ CONFIRM ]' }));
}

it('removes a draft without touching the sessions', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  await user.click(screen.getByRole('button', { name: '[ + NEW ]' }));
  expect(sidebarTitles()).toEqual(['New thread', 'Newest', 'Older']);
  await remove(user, /New thread/);
  expect(agent.deleteThread).not.toHaveBeenCalled();
  expect(sidebarTitles()).toEqual(['Newest', 'Older']);
  expect(heading()).toBe('Newest');
});

it('selects the next thread after deleting the active one', async () => {
  agent.listThreads.mockResolvedValue(list);
  agent.loadThread.mockImplementation(async (id: string) => [
    { type: 'text', text: `body ${id}` },
  ]);
  const user = await open();
  await screen.findByText('body b');
  await remove(user, /Newest/);
  expect(agent.deleteThread).toHaveBeenCalledWith('b', '/proj');
  expect(heading()).toBe('Older');
  expect(agent.loadThread).toHaveBeenCalledWith('a', '/proj');
  expect(await screen.findByText('body a')).toBeInTheDocument();
});

it('leaves a fresh draft after deleting the last thread', async () => {
  agent.listThreads.mockResolvedValue([list[1]]);
  const user = await open();
  await remove(user, /Older/);
  expect(sidebarTitles()).toEqual(['New thread']);
  expect(heading()).toBe('New thread');
  expect(screen.getByText('NO MESSAGES YET')).toBeInTheDocument();
});

it('keeps the active thread when deleting another', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  await user.click(screen.getByRole('button', { name: /Older/ }));
  await remove(user, /Newest/);
  expect(sidebarTitles()).toEqual(['Older']);
  expect(heading()).toBe('Older');
});

it('keeps the row and shows the error when deleting fails', async () => {
  agent.listThreads.mockResolvedValue(list);
  agent.deleteThread.mockRejectedValue(new Error('permission denied'));
  const user = await open();
  await remove(user, /Older/);
  expect(await screen.findByText('permission denied')).toBeInTheDocument();
  expect(sidebarTitles()).toEqual(['Newest', 'Older']);
  await user.click(screen.getByRole('button', { name: /Older/ }));
  expect(screen.queryByText('permission denied')).toBeNull();
});

it('orders threads by state and clears outcomes once seen', async () => {
  agent.listThreads.mockResolvedValue([
    ...list,
    { id: 'c', title: 'Oldest', updatedAt: 0 },
  ]);
  const user = await open();
  const state = (title: RegExp) =>
    row(title).getByLabelText(/^(attention|error|done|running|read)$/)
      .ariaLabel;

  await user.click(screen.getByRole('button', { name: /Oldest/ }));
  await sendPrompt(user, 'go');
  const runC = lastRunId();
  expect(state(/Oldest/)).toBe('running');
  expect(sidebarTitles()).toEqual(['Oldest', 'Newest', 'Older']);

  await user.click(screen.getByRole('button', { name: /Older/ }));
  await sendPrompt(user, 'go');
  act(() => emit({ type: 'error', message: 'boom' }, runC));
  await act(async () => finishRun(runC));
  expect(state(/Oldest/)).toBe('error');
  expect(sidebarTitles()).toEqual(['Oldest', 'Older', 'Newest']);

  act(() =>
    emit({
      type: 'done',
      ok: true,
      result: 'ok',
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
    }),
  );
  await act(async () => finishRun());
  expect(state(/Older/)).toBe('done');
  expect(sidebarTitles()).toEqual(['Oldest', 'Older', 'Newest']);

  await user.click(screen.getByRole('button', { name: /Oldest/ }));
  expect(state(/Oldest/)).toBe('read');
  expect(state(/Older/)).toBe('read');
  expect(sidebarTitles()).toEqual(['Newest', 'Older', 'Oldest']);
});

it('puts a new thread above running threads', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  await user.click(screen.getByRole('button', { name: /Older/ }));
  await sendPrompt(user, 'go');
  await user.click(screen.getByRole('button', { name: '[ + NEW ]' }));
  expect(sidebarTitles()).toEqual(['New thread', 'Older', 'Newest']);
});

async function running() {
  const user = await open();
  await sendPrompt(user, 'go');
  return user;
}

const finish = async () => {
  act(() =>
    emit({
      type: 'done',
      ok: true,
      result: 'ok',
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
    }),
  );
  await act(async () => finishRun());
};

it('shows a tool call as one quiet line', async () => {
  await running();
  act(() =>
    emit({ type: 'tool', name: 'Bash', input: { command: 'npm test\nmore' } }),
  );
  const line = screen.getByText('bash').parentElement!;
  expect(line).toHaveTextContent('npm test');
  expect(line.textContent).not.toMatch(/[{}]|more/);
});

it.each([
  ['Read', { file_path: '/src/a.ts' }, 'read', '/src/a.ts'],
  ['Grep', { pattern: 'foo.*bar' }, 'grep', 'foo.*bar'],
  [
    'Agent',
    { description: 'Find usages', prompt: 'long' },
    'agent',
    'Find usages',
  ],
  ['Mystery', { x: 1 }, 'mystery', '{"x":1}'],
])('summarises %s input', async (name, input, label, summary) => {
  await running();
  act(() => emit({ type: 'tool', name, input }));
  expect(screen.getByText(label).parentElement).toHaveTextContent(summary);
});

const steps: AgentEvent[] = [
  { type: 'text', text: 'let me look' },
  { type: 'tool', name: 'Bash', input: { command: 'ls' } },
  { type: 'text', text: 'all good' },
];

it('shows every step while running', async () => {
  await running();
  for (const e of steps) act(() => emit(e));
  expect(screen.getByText('let me look')).toBeInTheDocument();
  expect(screen.getByText('bash')).toBeInTheDocument();
  expect(screen.getByText('all good')).toBeInTheDocument();
});

it('keeps only the final answer once the run finishes', async () => {
  await running();
  for (const e of steps) act(() => emit(e));
  await finish();
  expect(screen.getByText('all good')).toBeInTheDocument();
  expect(screen.queryByText('let me look')).toBeNull();
  expect(screen.queryByText('bash')).toBeNull();
  expect(screen.getByText(/DONE/)).toBeInTheDocument();
});

it('keeps text written in response to a subagent', async () => {
  await running();
  for (const e of [
    { type: 'tool', name: 'Agent', input: { description: 'explore' } },
    { type: 'text', text: 'subagent says hi' },
    { type: 'tool', name: 'Read', input: { file_path: 'a' } },
    { type: 'text', text: 'after read' },
    { type: 'tool', name: 'Task', input: { description: 'older' } },
    { type: 'text', text: 'task says hi' },
    { type: 'tool', name: 'Bash', input: { command: 'ls' } },
    { type: 'text', text: 'final' },
  ] as AgentEvent[])
    act(() => emit(e));
  await finish();
  expect(screen.getByText('subagent says hi')).toBeInTheDocument();
  expect(screen.getByText('task says hi')).toBeInTheDocument();
  expect(screen.getByText('final')).toBeInTheDocument();
  expect(screen.queryByText('after read')).toBeNull();
  expect(screen.queryByText('agent')).toBeNull();
});

it('toggles hidden items in a finished turn', async () => {
  const user = await running();
  for (const e of steps) act(() => emit(e));
  await finish();
  await user.click(screen.getByRole('button', { name: '[ 2 HIDDEN ]' }));
  expect(screen.getByText('let me look')).toBeInTheDocument();
  expect(screen.getByText('bash')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '[ HIDE ]' }));
  expect(screen.queryByText('let me look')).toBeNull();
  expect(screen.queryByText('bash')).toBeNull();
});

it('shows no toggle when nothing is hidden', async () => {
  await running();
  act(() => emit({ type: 'text', text: 'just an answer' }));
  await finish();
  expect(screen.getByText('just an answer')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /HIDDEN/ })).toBeNull();
});

it('keeps errors visible in a finished turn', async () => {
  await running();
  for (const e of [
    ...steps,
    { type: 'error', message: 'exploded' },
    { type: 'tool', name: 'Bash', input: { command: 'ls' } },
  ] as AgentEvent[])
    act(() => emit(e));
  await finish();
  expect(screen.getByText('exploded')).toBeInTheDocument();
  expect(screen.queryByText('bash')).toBeNull();
});

it('renders bold as strong inside markdown', async () => {
  await running();
  act(() => emit({ type: 'text', text: 'this is **loud**' }));
  const strong = screen.getByText('loud');
  expect(strong.tagName).toBe('STRONG');
  expect(strong.closest('.markdown')).not.toBeNull();
});

it('shows cost and token usage once the run is done', async () => {
  const user = await open();
  await sendPrompt(user, 'hi');
  act(() =>
    emit({
      type: 'done',
      ok: true,
      result: 'ok',
      costUsd: 0.0123,
      inputTokens: 12345,
      outputTokens: 678,
    }),
  );
  expect(
    screen.getByText('DONE · $0.0123 · 12.3K IN · 678 OUT'),
  ).toBeInTheDocument();
});
