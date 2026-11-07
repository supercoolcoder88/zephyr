import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import type { AgentEvent } from './agent-types';

type User = ReturnType<typeof userEvent.setup>;

let emit: (event: AgentEvent) => void;
let finishRun: () => void;
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
    () => new Promise<void>((resolve) => (finishRun = resolve)),
  );
  agent.onEvent.mockImplementation((listener) => {
    emit = listener;
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
    { type: 'tool', name: 'Read', input: { path: 'x' } },
  ]);
  await open();
  expect(agent.listThreads).toHaveBeenCalledWith('/proj');
  expect(sidebarTitles()).toEqual(['01Newest', '02Older']);
  expect(heading()).toBe('Newest');
  expect(agent.loadThread).toHaveBeenCalledWith('b', '/proj');
  expect(await screen.findByText('old answer')).toBeInTheDocument();
  expect(screen.getByText('old prompt')).toBeInTheDocument();
  expect(screen.getByText('Read')).toBeInTheDocument();
});

it('shows one empty draft when the project has no sessions', async () => {
  await open();
  expect(sidebarTitles()).toEqual(['01New thread']);
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
  expect(agent.run).toHaveBeenCalledWith('continue', '/proj', 'b');
});

it('starts a fresh session when sending in a draft', async () => {
  const user = await open();
  await sendPrompt(user, 'start');
  expect(agent.run).toHaveBeenCalledWith('start', '/proj', undefined);
});

it('swaps a draft to its session id and refreshes the list after the run', async () => {
  agent.listThreads.mockResolvedValueOnce(list);
  agent.loadThread.mockResolvedValue([{ type: 'text', text: 'old answer' }]);
  const user = await open();
  await user.click(screen.getByRole('button', { name: '[ + NEW ]' }));
  expect(heading()).toBe('New thread');
  await sendPrompt(user, 'first prompt');
  expect(agent.run).toHaveBeenLastCalledWith(
    'first prompt',
    '/proj',
    undefined,
  );

  act(() => emit({ type: 'session', sessionId: 'sid' }));
  act(() => emit({ type: 'text', text: 'live answer' }));
  act(() => emit({ type: 'done', ok: true, result: 'ok', costUsd: 0.01 }));
  expect(screen.getByText('live answer')).toBeInTheDocument();
  expect(heading()).toBe('first prompt');

  agent.listThreads.mockResolvedValueOnce([
    { id: 'sid', title: 'Summarised title', updatedAt: 3 },
    ...list,
  ]);
  await act(async () => finishRun());
  expect(agent.listThreads).toHaveBeenCalledTimes(2);
  expect(sidebarTitles()).toEqual([
    '01Summarised title',
    '02Newest',
    '03Older',
  ]);
  expect(heading()).toBe('Summarised title');
  expect(screen.getByText('live answer')).toBeInTheDocument();
  expect(screen.getByText(/DONE/)).toBeInTheDocument();
  expect(agent.loadThread).not.toHaveBeenCalledWith('sid', '/proj');

  await sendPrompt(user, 'second prompt');
  expect(agent.run).toHaveBeenLastCalledWith('second prompt', '/proj', 'sid');
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

it('asks for confirmation before deleting', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  await user.click(row(/Older/).getByRole('button', { name: '[ DEL ]' }));
  expect(agent.deleteThread).not.toHaveBeenCalled();
  expect(sidebarTitles()).toEqual(['01Newest', '02Older']);
  await user.click(row(/Older/).getByRole('button', { name: '[ CONFIRM ]' }));
  expect(agent.deleteThread).toHaveBeenCalledWith('a', '/proj');
  expect(sidebarTitles()).toEqual(['01Newest']);
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
  expect(sidebarTitles()).toEqual(['01New thread', '02Newest', '03Older']);
  await remove(user, /New thread/);
  expect(agent.deleteThread).not.toHaveBeenCalled();
  expect(sidebarTitles()).toEqual(['01Newest', '02Older']);
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
  expect(sidebarTitles()).toEqual(['01New thread']);
  expect(heading()).toBe('New thread');
  expect(screen.getByText('NO MESSAGES YET')).toBeInTheDocument();
});

it('keeps the active thread when deleting another', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  await user.click(screen.getByRole('button', { name: /Older/ }));
  await remove(user, /Newest/);
  expect(sidebarTitles()).toEqual(['01Older']);
  expect(heading()).toBe('Older');
});

it('keeps the row and shows the error when deleting fails', async () => {
  agent.listThreads.mockResolvedValue(list);
  agent.deleteThread.mockRejectedValue(new Error('permission denied'));
  const user = await open();
  await remove(user, /Older/);
  expect(await screen.findByText('permission denied')).toBeInTheDocument();
  expect(sidebarTitles()).toEqual(['01Newest', '02Older']);
  await user.click(screen.getByRole('button', { name: /Older/ }));
  expect(screen.queryByText('permission denied')).toBeNull();
});
