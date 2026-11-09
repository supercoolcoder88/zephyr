import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode, Ref } from 'react';
import { beforeEach, expect, it, onTestFinished, vi } from 'vitest';
import App from './App';
import type { AgentEvent, Todo, TodoApi } from './agent-types';

// jsdom gives every element a zero-size box, so the library's pointer hit-testing
// would treat every click as a separator drag. The fake panel collapses and
// expands through its handle, and layouts load through the real storage hook.
vi.mock('react-resizable-panels', async (importActual) => {
  const { useImperativeHandle, useRef } = await import('react');
  const { useDefaultLayout } =
    await importActual<typeof import('react-resizable-panels')>();
  return {
    Group: ({
      children,
      'data-snap': snap,
    }: {
      children?: ReactNode;
      'data-snap'?: boolean;
    }) => <div data-snap={snap}>{children}</div>,
    Panel: ({
      children,
      panelRef,
      onResize,
    }: {
      children?: ReactNode;
      panelRef?: Ref<unknown>;
      onResize?(size: { inPixels: number }): void;
    }) => {
      const collapsed = useRef(false);
      useImperativeHandle(panelRef, () => ({
        isCollapsed: () => collapsed.current,
        collapse: () => {
          collapsed.current = true;
          onResize?.({ inPixels: 0 });
        },
        expand: () => {
          collapsed.current = false;
          onResize?.({ inPixels: 280 });
        },
      }));
      return <div>{children}</div>;
    },
    Separator: ({
      children,
      onClick,
      onPointerDown,
    }: ComponentProps<'div'>) => (
      <div onClick={onClick} onPointerDown={onPointerDown}>
        {children}
      </div>
    ),
    useDefaultLayout,
    usePanelRef: () => useRef(null),
  };
});

// jsdom has no DragEvent, and a plain Event drops clientY.
globalThis.DragEvent ??= class extends MouseEvent {} as typeof DragEvent;

type User = ReturnType<typeof userEvent.setup>;

let listener: (runId: string, event: AgentEvent) => void;
const lastRunId = () => agent.send.mock.lastCall![0] as string;
const emit = (event: AgentEvent, runId = lastRunId()) => listener(runId, event);
const finishRun = (runId = lastRunId()) =>
  emit({ type: 'state', state: 'idle' }, runId);
const agent = {
  send: vi.fn(),
  pickWorkspace: vi.fn(),
  complete: vi.fn(
    async (_cwd: string, _partial: string): Promise<string[]> => [],
  ),
  interrupt: vi.fn(),
  close: vi.fn(),
  usage: vi.fn(),
  onEvent: vi.fn(),
  listThreads: vi.fn(),
  loadThread: vi.fn(),
  deleteThread: vi.fn(),
  catalog: vi.fn(),
  paths: vi.fn(),
  setPermission: vi.fn(),
  answerPermission: vi.fn(),
};
const todos = {
  watch: vi.fn<TodoApi['watch']>(),
  edit: vi.fn<TodoApi['edit']>(),
  onChange: vi.fn<TodoApi['onChange']>(),
};

beforeEach(() => {
  vi.clearAllMocks();
  agent.pickWorkspace.mockResolvedValue('/proj');
  agent.listThreads.mockResolvedValue([]);
  agent.loadThread.mockResolvedValue([]);
  agent.deleteThread.mockResolvedValue(undefined);
  agent.paths.mockResolvedValue({});
  agent.catalog.mockResolvedValue({
    commands: [
      { name: 'compact', description: 'Summarize', argumentHint: '' },
      { name: 'review', description: 'Review a PR', argumentHint: '<pr>' },
    ],
    models: [
      {
        value: 'opus',
        displayName: 'Opus 5.5',
        efforts: ['low', 'high'],
        defaultEffort: 'high',
      },
      {
        value: 'sonnet',
        displayName: 'Sonnet 5.5',
        efforts: ['low', 'high'],
        defaultEffort: 'low',
      },
    ],
  });
  localStorage.clear();
  agent.send.mockResolvedValue(undefined);
  agent.setPermission.mockResolvedValue(undefined);
  agent.answerPermission.mockResolvedValue(undefined);
  agent.interrupt.mockResolvedValue(undefined);
  agent.close.mockResolvedValue(undefined);
  agent.onEvent.mockImplementation((l) => {
    listener = l;
    return () => undefined;
  });
  window.agent = agent;
  todos.watch.mockResolvedValue([]);
  todos.edit.mockReset();
  todos.onChange.mockImplementation(() => () => undefined);
  window.todos = todos;
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

it('opens the folder it was launched with, skipping the picker', async () => {
  history.replaceState(null, '', '?workspace=%2Flaunched');
  render(<App />);
  await screen.findByRole('navigation');
  expect(agent.pickWorkspace).not.toHaveBeenCalled();
  expect(agent.listThreads).toHaveBeenCalledWith('/launched');
  history.replaceState(null, '', '/');
});

it('lists sessions on open and loads the newest', async () => {
  agent.listThreads.mockResolvedValue(list);
  agent.loadThread.mockResolvedValue([
    { type: 'user', text: 'old prompt' },
    { type: 'text', text: 'old answer' },
    { type: 'tool', id: 'tu', name: 'Read', input: { file_path: 'x.ts' } },
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
  expect(
    screen.getByRole('button', { name: '[ SHOW THINKING ]' }),
  ).toBeTruthy();
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
  expect(agent.send).toHaveBeenCalledWith(
    expect.any(String),
    'continue',
    [],
    '/proj',
    'b',
    { model: 'opus' },
    'auto',
    expect.any(String),
  );
});

it('starts a fresh session when sending in a draft', async () => {
  const user = await open();
  await sendPrompt(user, 'start');
  expect(agent.send).toHaveBeenCalledWith(
    expect.any(String),
    'start',
    [],
    '/proj',
    undefined,
    { model: 'opus' },
    'auto',
    expect.any(String),
  );
});

it('attaches pasted images and sends them with the prompt', async () => {
  const user = await open();
  const box = screen.getByPlaceholderText('Ask the agent…');
  fireEvent.paste(box, {
    clipboardData: {
      files: [new File(['png'], 'shot.png', { type: 'image/png' })],
    },
  });
  await user.click(await screen.findByRole('button', { name: 'Remove image' }));
  expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull();
  fireEvent.paste(box, {
    clipboardData: {
      files: [new File(['png'], 'shot.png', { type: 'image/png' })],
    },
  });
  await screen.findByRole('button', { name: 'Remove image' });
  await user.click(screen.getByRole('button', { name: '[ SEND ]' }));
  expect(agent.send).toHaveBeenCalledWith(
    expect.any(String),
    '',
    [{ mediaType: 'image/png', data: btoa('png') }],
    '/proj',
    undefined,
    { model: 'opus' },
    'auto',
    expect.any(String),
  );
  expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull();
});

it('sends on Enter and inserts a newline on Shift+Enter', async () => {
  const user = await open();
  await user.type(
    screen.getByPlaceholderText('Ask the agent…'),
    'line one{Shift>}{Enter}{/Shift}line two{Enter}',
  );
  expect(agent.send).toHaveBeenCalledWith(
    expect.any(String),
    'line one\nline two',
    [],
    '/proj',
    undefined,
    { model: 'opus' },
    'auto',
    expect.any(String),
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
  const runId = lastRunId();
  expect(agent.send).toHaveBeenLastCalledWith(
    expect.any(String),
    'first prompt',
    [],
    '/proj',
    undefined,
    { model: 'opus' },
    'auto',
    expect.any(String),
  );

  act(() => emit({ type: 'session', sessionId: 'sid' }));
  act(() => emit({ type: 'text', text: 'live answer' }));
  act(() => emit({ type: 'done', ok: true, result: 'ok' }));
  expect(screen.getByText('live answer')).toBeInTheDocument();
  expect(screen.queryByText(/% USED$/)).toBeNull();
  act(() => emit({ type: 'context', percentage: 9.6 }));
  expect(screen.getByText('10% USED')).toBeInTheDocument();
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
  expect(screen.getByText('10% USED')).toBeInTheDocument();
  expect(screen.queryByText(/DONE|\$/)).toBeNull();
  expect(agent.loadThread).not.toHaveBeenCalledWith('sid', '/proj');

  await sendPrompt(user, 'second prompt');
  expect(agent.send).toHaveBeenLastCalledWith(
    runId,
    'second prompt',
    [],
    '/proj',
    'sid',
    { model: 'opus' },
    'auto',
    expect.any(String),
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
  expect(agent.send).toHaveBeenLastCalledWith(
    runA,
    'second',
    [],
    '/proj',
    'a',
    { model: 'opus' },
    'auto',
    expect.any(String),
  );

  act(() => emit({ type: 'text', text: 'answer b' }, runB));
  act(() => emit({ type: 'text', text: 'answer a' }, runA));
  expect(screen.getByText('answer a')).toBeInTheDocument();
  expect(screen.queryByText('answer b')).toBeNull();

  await user.click(screen.getByRole('button', { name: '[ STOP ]' }));
  expect(agent.interrupt).toHaveBeenCalledWith(runA);

  await act(async () => finishRun(runA));
  expect(screen.queryByRole('status', { name: 'Working' })).toBeNull();
  await user.click(screen.getByRole('button', { name: /Newest/ }));
  expect(screen.getByText('answer b')).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Working' })).toBeInTheDocument();
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

  act(() => emit({ type: 'done', ok: true, result: 'ok' }));
  await act(async () => finishRun());
  expect(state(/Older/)).toBe('done');
  expect(sidebarTitles()).toEqual(['Oldest', 'Older', 'Newest']);

  await user.click(screen.getByRole('button', { name: /Oldest/ }));
  expect(state(/Oldest/)).toBe('read');
  expect(state(/Older/)).toBe('read');
  expect(sidebarTitles()).toEqual(['Newest', 'Older', 'Oldest']);
});

it('archives read threads past the newest three', async () => {
  agent.listThreads.mockResolvedValue(
    [5, 4, 3, 2, 1].map((n) => ({ id: `t${n}`, title: `T${n}`, updatedAt: n })),
  );
  const user = await open();
  expect(sidebarTitles()).toEqual(['T5', 'T4', 'T3', '[ ARCHIVED 2 ]']);

  await user.click(screen.getByRole('button', { name: '[ ARCHIVED 2 ]' }));
  expect(sidebarTitles()).toEqual([
    'T5',
    'T4',
    'T3',
    '[ HIDE ARCHIVED ]',
    'T2',
    'T1',
  ]);

  await user.click(screen.getByRole('button', { name: /T1/ }));
  await user.click(screen.getByRole('button', { name: '[ HIDE ARCHIVED ]' }));
  expect(sidebarTitles()).toEqual(['T5', 'T4', 'T3', 'T1', '[ ARCHIVED 1 ]']);

  await sendPrompt(user, 'go');
  expect(sidebarTitles()).toEqual(['T1', 'T5', 'T4', 'T3', '[ ARCHIVED 1 ]']);
});

it('puts a new thread above running threads', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  await user.click(screen.getByRole('button', { name: /Older/ }));
  await sendPrompt(user, 'go');
  await user.click(screen.getByRole('button', { name: '[ + NEW ]' }));
  expect(sidebarTitles()).toEqual(['New thread', 'Older', 'Newest']);
});

it('runs a slash command picked from the menu', async () => {
  const user = await open();
  const box = screen.getByPlaceholderText('Ask the agent…');
  await user.type(box, '/');
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
    '/compactSummarize',
    '/review <pr>Review a PR',
  ]);
  await user.type(box, 'co{Enter}');
  expect(agent.send).toHaveBeenCalledWith(
    expect.any(String),
    '/compact',
    [],
    '/proj',
    undefined,
    { model: 'opus' },
    'auto',
    expect.any(String),
  );
});

it('sends with the model and effort picked from the composer', async () => {
  const user = await open();
  const picker = screen.getByRole('button', { name: 'Opus 5.5 · high' });
  await user.click(picker);
  expect(
    ['Opus 5.5', 'Sonnet 5.5'].map(
      (name) => screen.getByRole('menuitemradio', { name }).textContent,
    ),
  ).toEqual(['>Opus 5.5high', 'Sonnet 5.5low']);
  await user.hover(screen.getByRole('menuitemradio', { name: 'Sonnet 5.5' }));
  const efforts = screen.getByRole('menu', { name: 'Sonnet 5.5 effort' });
  expect(
    within(efforts)
      .getAllByRole('menuitemradio')
      .map((b) => b.textContent),
  ).toEqual(['>lowdefault', 'high']);
  const high = within(efforts).getByRole('menuitemradio', { name: 'high' });
  await user.hover(high);
  expect(high).toHaveFocus();
  expect(
    screen.getByRole('menuitemradio', { name: 'Sonnet 5.5' }),
  ).toHaveAttribute('data-highlighted');
  expect(
    screen.getByRole('menuitemradio', { name: 'Opus 5.5' }),
  ).not.toHaveAttribute('data-highlighted');
  await user.click(high);
  expect(screen.queryByRole('menu')).toBeNull();
  expect(picker).toHaveTextContent('Sonnet 5.5 · high');
  await sendPrompt(user, 'go');
  expect(agent.send).toHaveBeenCalledWith(
    expect.any(String),
    'go',
    [],
    '/proj',
    undefined,
    { model: 'sonnet', effort: 'high' },
    'auto',
    expect.any(String),
  );

  await act(async () => finishRun());
  await user.click(picker);
  await user.click(screen.getByRole('menuitemradio', { name: 'Sonnet 5.5' }));
  expect(picker).toHaveTextContent('Sonnet 5.5 · low');
  await sendPrompt(user, 'again');
  expect(agent.send).toHaveBeenLastCalledWith(
    expect.any(String),
    'again',
    [],
    '/proj',
    undefined,
    { model: 'sonnet' },
    'auto',
    expect.any(String),
  );
});

it('shows the last known model and effort before the catalog loads', async () => {
  localStorage.setItem(
    'models',
    JSON.stringify([
      {
        value: 'opus',
        displayName: 'Opus 5.5',
        efforts: ['medium'],
        defaultEffort: 'medium',
      },
    ]),
  );
  agent.pickWorkspace.mockResolvedValue('/uncached');
  agent.catalog.mockReturnValue(new Promise(() => {}));
  await open();
  expect(
    screen.getByRole('button', { name: 'Opus 5.5 · medium' }),
  ).toBeInTheDocument();
});

it('picks a model and effort from the keyboard', async () => {
  const user = await open();
  const picker = screen.getByRole('button', { name: 'Opus 5.5 · high' });
  picker.focus();
  await user.keyboard('{Enter}{ArrowDown}{ArrowDown}');
  expect(
    screen.getByRole('menuitemradio', { name: 'Sonnet 5.5' }),
  ).toHaveFocus();
  await user.keyboard('{ArrowLeft}{ArrowDown}');
  const efforts = screen.getByRole('menu', { name: 'Sonnet 5.5 effort' });
  expect(
    within(efforts).getByRole('menuitemradio', { name: 'high' }),
  ).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(picker).toHaveTextContent('Sonnet 5.5 · high');
  expect(picker).toHaveFocus();

  await user.keyboard('{Enter}{Escape}');
  expect(screen.queryByRole('menu')).toBeNull();
  expect(picker).toHaveFocus();
});

it('completes slash commands that take arguments', async () => {
  const user = await open();
  const box = screen.getByPlaceholderText('Ask the agent…');
  await user.type(box, '/{ArrowDown}');
  const listbox = screen.getByRole('listbox');
  expect(box).toHaveAttribute('aria-expanded', 'true');
  expect(box).toHaveAttribute('aria-controls', listbox.id);
  expect(box).toHaveAttribute(
    'aria-activedescendant',
    screen.getByRole('option', { selected: true, name: /review/ }).id,
  );
  await user.keyboard('{Enter}');
  expect(box).toHaveValue('/review ');
  expect(box).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(agent.send).not.toHaveBeenCalled();

  await user.clear(box);
  await user.type(box, '/{Escape}');
  expect(screen.queryByRole('listbox')).toBeNull();
});

it("lists a turn's subthreads and opens one in a popup", async () => {
  const user = await open();
  await sendPrompt(user, 'go');
  act(() =>
    emit({
      type: 'tool',
      id: 't1',
      name: 'Agent',
      input: { description: 'count files' },
    }),
  );
  act(() => emit({ type: 'subthread', id: 't1', title: 'count files' }));
  act(() =>
    emit({
      type: 'subthread-output',
      id: 't1',
      output: { type: 'text', text: 'counting now' },
    }),
  );
  expect(
    within(screen.getByRole('navigation')).queryByText('count files'),
  ).toBeNull();

  await user.click(screen.getByRole('button', { name: '[ SUBTHREADS 1 ]' }));
  const sub = screen.getByRole('button', { name: /count files/ });
  expect(within(sub).getByLabelText('running')).toBeInTheDocument();

  await user.click(sub);
  const popup = screen.getByRole('dialog', { name: 'count files' });
  expect(within(popup).getByText('counting now')).toBeInTheDocument();
  expect(within(popup).getByText('RUNNING')).toBeInTheDocument();
  const close = within(popup).getByRole('button', { name: '[ CLOSE ]' });
  expect(close).toHaveFocus();
  await user.tab();
  expect(close).toHaveFocus();

  act(() => emit({ type: 'subthread-end', id: 't1', ok: true }));
  expect(within(popup).getByText('DONE')).toBeInTheDocument();

  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(sub).toHaveFocus();
  expect(within(sub).getByLabelText('done')).toBeInTheDocument();
});

it('colours valid slash commands and existing @ paths in the composer', async () => {
  agent.paths.mockImplementation(async (_cwd: string, candidates: string[]) =>
    Object.fromEntries(
      candidates.flatMap((c) =>
        c === 'src/App.tsx'
          ? [[c, 'file']]
          : c === 'src/'
            ? [[c, 'folder']]
            : [],
      ),
    ),
  );
  const user = await open();
  const box = screen.getByPlaceholderText('Ask the agent…');
  await user.type(
    box,
    '/review @src/App.tsx @src/ src/App.tsx @missing.ts{Escape}',
  );
  const mirror = box.previousElementSibling!;
  expect(
    await within(mirror as HTMLElement).findByText('@src/App.tsx'),
  ).toHaveClass('text-file');
  expect(within(mirror as HTMLElement).getByText('/review')).toHaveClass(
    'text-command',
  );
  expect(within(mirror as HTMLElement).getByText('@src/')).toHaveClass(
    'text-folder',
  );
  expect(agent.paths).toHaveBeenLastCalledWith('/proj', [
    'src/App.tsx',
    'src/',
    'missing.ts',
  ]);
  expect(mirror.querySelectorAll('.text-file')).toHaveLength(1);

  await user.clear(box);
  await user.type(box, '/nope');
  expect(mirror.querySelector('.text-command')).toBeNull();
});

it('tab completes @ paths, keeping folders open and spacing after files', async () => {
  agent.complete.mockImplementation(
    async (_cwd: string, partial: string) =>
      ({
        'src/c': ['src/components/'],
        'src/components/': ['src/components/chat/', 'src/components/Item.tsx'],
      })[partial] ?? [],
  );
  const user = await open();
  const box = screen.getByPlaceholderText('Ask the agent…');
  await user.type(box, 'see @src/c');
  expect(await screen.findByRole('option', { name: '@src/components/' }));
  await user.keyboard('{Tab}');
  expect(box).toHaveValue('see @src/components/');
  await screen.findByRole('option', { name: '@src/components/Item.tsx' });
  await user.keyboard('{ArrowDown}{Tab}');
  expect(box).toHaveValue('see @src/components/Item.tsx ');
  expect(screen.queryByRole('option')).toBeNull();
  expect(agent.complete).toHaveBeenCalledWith('/proj', 'src/c');
});

async function running() {
  const user = await open();
  await sendPrompt(user, 'go');
  return user;
}

const finish = async () => {
  act(() => emit({ type: 'done', ok: true, result: 'ok' }));
  await act(async () => finishRun());
};

it('shows a tool call as one quiet line', async () => {
  await running();
  act(() =>
    emit({
      type: 'tool',
      id: 'tu',
      name: 'Bash',
      input: { command: 'npm test\nmore' },
    }),
  );
  const line = screen.getByText('bash').parentElement!;
  expect(line).toHaveTextContent('npm test');
  expect(line.textContent).not.toMatch(/[{}]|more/);
});

it("shows the agent's questions and options in a box that stays after the run", async () => {
  await running();
  act(() =>
    emit({
      type: 'tool',
      id: 'tu',
      name: 'AskUserQuestion',
      input: {
        questions: [
          {
            question: 'How should a test open a workspace?',
            header: 'Workspace',
            multiSelect: false,
            options: [
              { label: 'Env var override', description: 'Skip the dialog.' },
              { label: 'Main-process inspector', description: 'Patch main.' },
            ],
          },
        ],
      },
    }),
  );
  act(() => emit({ type: 'done', ok: true, result: '' }));
  const box = screen.getByRole('group', { name: 'Questions' });
  expect(box).toHaveTextContent('How should a test open a workspace?');
  expect(box).toHaveTextContent('01Env var overrideSkip the dialog.');
  expect(box).toHaveTextContent('02Main-process inspector');
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
  act(() => emit({ type: 'tool', id: 'tu', name, input }));
  expect(screen.getByText(label).parentElement).toHaveTextContent(summary);
});

const steps: AgentEvent[] = [
  { type: 'text', text: 'let me look' },
  { type: 'tool', id: 'tu', name: 'Bash', input: { command: 'ls' } },
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
  expect(screen.queryByText(/DONE|\$/)).toBeNull();
});

it('keeps text written in response to a subagent', async () => {
  await running();
  for (const e of [
    {
      type: 'tool',
      id: 'tu',
      name: 'Agent',
      input: { description: 'explore' },
    },
    { type: 'text', text: 'subagent says hi' },
    { type: 'tool', id: 'tu', name: 'Read', input: { file_path: 'a' } },
    { type: 'text', text: 'after read' },
    { type: 'tool', id: 'tu', name: 'Task', input: { description: 'older' } },
    { type: 'text', text: 'task says hi' },
    { type: 'tool', id: 'tu', name: 'Bash', input: { command: 'ls' } },
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
  await user.click(screen.getByRole('button', { name: '[ SHOW THINKING ]' }));
  expect(screen.getByText('let me look')).toBeInTheDocument();
  expect(screen.getByText('bash')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '[ HIDE THINKING ]' }));
  expect(screen.queryByText('let me look')).toBeNull();
  expect(screen.queryByText('bash')).toBeNull();
});

it('shows no toggle when nothing is hidden', async () => {
  await running();
  act(() => emit({ type: 'text', text: 'just an answer' }));
  await finish();
  expect(screen.getByText('just an answer')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /THINKING/ })).toBeNull();
});

it('keeps errors visible in a finished turn', async () => {
  await running();
  for (const e of [
    ...steps,
    { type: 'error', message: 'exploded' },
    { type: 'tool', id: 'tu', name: 'Bash', input: { command: 'ls' } },
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

it('shows a failed run with its reason and no cost', async () => {
  const user = await open();
  await sendPrompt(user, 'hi');
  act(() => emit({ type: 'done', ok: false, result: 'error_max_turns' }));
  expect(screen.getByText('FAILED · error_max_turns')).toBeInTheDocument();
});

it('drops an untouched draft when leaving it', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  await user.click(screen.getByRole('button', { name: '[ + NEW ]' }));
  expect(sidebarTitles()).toEqual(['New thread', 'Newest', 'Older']);
  await user.click(screen.getByRole('button', { name: /Older/ }));
  expect(sidebarTitles()).toEqual(['Newest', 'Older']);
});

it('keeps a draft with text as yellow and restores its text', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  await user.click(screen.getByRole('button', { name: '[ + NEW ]' }));
  await user.type(screen.getByPlaceholderText('Ask the agent…'), 'half typed');
  await user.click(screen.getByRole('button', { name: /Older/ }));
  expect(sidebarTitles()).toEqual(['New thread', 'Newest', 'Older']);
  expect(row(/New thread/).getByLabelText('draft')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /New thread/ }));
  expect(screen.getByPlaceholderText('Ask the agent…')).toHaveValue(
    'half typed',
  );
});

it('keeps pasted images with a draft across thread switches', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  await user.click(screen.getByRole('button', { name: '[ + NEW ]' }));
  fireEvent.paste(screen.getByPlaceholderText('Ask the agent…'), {
    clipboardData: {
      files: [new File(['png'], 'shot.png', { type: 'image/png' })],
    },
  });
  await screen.findByRole('button', { name: 'Remove image' });
  await user.click(screen.getByRole('button', { name: /Older/ }));
  expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull();
  expect(row(/New thread/).getByLabelText('draft')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /New thread/ }));
  expect(
    screen.getByRole('button', { name: 'Remove image' }),
  ).toBeInTheDocument();
});

it('rejects pasted images over 5 MB', async () => {
  await open();
  const big = new File([new Uint8Array(4 * 1024 * 1024)], 'big.png', {
    type: 'image/png',
  });
  fireEvent.paste(screen.getByPlaceholderText('Ask the agent…'), {
    clipboardData: { files: [big] },
  });
  expect(screen.getByText(/IMAGE OVER 5 MB/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull();
});

it('queues a message sent while the agent is running into the same run', async () => {
  const user = await running();
  const runId = lastRunId();
  act(() => emit({ type: 'text', text: 'working' }));
  await sendPrompt(user, 'also this');
  expect(screen.getByText('also this').closest('.opacity-50')).not.toBeNull();
  expect(agent.send).toHaveBeenCalledTimes(2);
  expect(agent.send).toHaveBeenLastCalledWith(
    runId,
    'also this',
    [],
    '/proj',
    undefined,
    { model: 'opus' },
    'auto',
    expect.any(String),
  );
  expect(screen.getByRole('status', { name: 'Working' })).toBeInTheDocument();
  act(() => emit({ type: 'text', text: 'still on the first' }));
  const uuid = agent.send.mock.lastCall![7] as string;
  act(() => emit({ type: 'picked', ids: [uuid] }));
  act(() => emit({ type: 'text', text: 'on the second' }));
  expect(screen.getByText('also this').closest('.opacity-50')).toBeNull();
  const order = ['still on the first', 'also this', 'on the second'].map((t) =>
    screen.getByText(t),
  );
  expect(
    order[0].compareDocumentPosition(order[1]) &
      order[1].compareDocumentPosition(order[2]) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it.each([
  ['goes idle', { type: 'state', state: 'idle' }],
  ['ends', { type: 'end' }],
] as [string, AgentEvent][])(
  'stays running after a result until the session %s',
  async (_, event) => {
    await running();
    act(() => emit({ type: 'done', ok: true, result: 'ok' }));
    expect(screen.getByRole('status', { name: 'Working' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '[ STOP ]' }),
    ).toBeInTheDocument();
    act(() => emit({ type: 'state', state: 'running' }));
    expect(screen.getByRole('status', { name: 'Working' })).toBeInTheDocument();
    expect(agent.listThreads).toHaveBeenCalledTimes(1);
    await act(async () => emit(event));
    expect(screen.queryByRole('status', { name: 'Working' })).toBeNull();
    expect(screen.queryByRole('button', { name: '[ STOP ]' })).toBeNull();
    expect(agent.listThreads).toHaveBeenCalledTimes(2);
  },
);

it('stops the turn without ending the session', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await running();
  const runId = lastRunId();
  await sendPrompt(user, 'queued');
  expect(screen.getByText('queued')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '[ STOP ]' }));
  expect(agent.interrupt).toHaveBeenCalledWith(runId);
  expect(screen.queryByText('queued')).toBeNull();
  act(() =>
    emit({ type: 'done', ok: false, result: 'error_during_execution' }),
  );
  expect(screen.getByText('STOPPED')).toBeInTheDocument();
  expect(screen.queryByText(/error_during_execution/)).toBeNull();
  await act(async () => finishRun());
  await sendPrompt(user, 'next');
  expect(agent.send).toHaveBeenLastCalledWith(
    runId,
    'next',
    [],
    '/proj',
    'b',
    { model: 'opus' },
    'auto',
    expect.any(String),
  );
  expect(agent.close).not.toHaveBeenCalled();
});

it('shows a failed stop as an error', async () => {
  const user = await running();
  agent.interrupt.mockRejectedValue(new Error('session closing'));
  await user.click(screen.getByRole('button', { name: '[ STOP ]' }));
  expect(await screen.findByText('session closing')).toHaveClass('text-alert');
});

it('closes the live session of a deleted thread', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await running();
  const runId = lastRunId();
  await act(async () => finishRun());
  await remove(user, /Older/);
  expect(agent.close).not.toHaveBeenCalled();
  await remove(user, /Newest/);
  expect(agent.close).toHaveBeenCalledWith(runId);
  expect(agent.deleteThread).toHaveBeenCalledWith('b', '/proj');
});

it("closes the left project's idle sessions and resumes them on return", async () => {
  agent.listThreads.mockImplementation(async (cwd: string) =>
    cwd === '/proj' ? list : [{ id: 'o', title: 'Other', updatedAt: 3 }],
  );
  const user = await open();
  await sendPrompt(user, 'first');
  const idleRun = lastRunId();
  await act(async () => finishRun());
  await user.click(screen.getByRole('button', { name: /Older/ }));
  await sendPrompt(user, 'second');
  const busyRun = lastRunId();

  agent.pickWorkspace.mockResolvedValue('/other');
  await user.click(screen.getByRole('button', { name: 'proj' }));
  await screen.findByRole('button', { name: /Other/ });
  expect(agent.close).toHaveBeenCalledWith(idleRun);
  expect(agent.close).not.toHaveBeenCalledWith(busyRun);

  agent.pickWorkspace.mockResolvedValue('/proj');
  await user.click(screen.getByRole('button', { name: 'other' }));
  await user.click(await screen.findByRole('button', { name: /Newest/ }));
  await sendPrompt(user, 'again');
  expect(agent.send).toHaveBeenLastCalledWith(
    idleRun,
    'again',
    [],
    '/proj',
    'b',
    { model: 'opus' },
    'auto',
    expect.any(String),
  );
});

it('defaults to auto mode and switches mode from the sidebar', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  await sendPrompt(user, 'go');
  const runId = lastRunId();
  expect(agent.send.mock.lastCall![6]).toBe('auto');
  await user.click(screen.getByRole('button', { name: '[ Auto ]' }));
  const menu = screen.getByRole('menu', { name: 'Permission mode' });
  expect(
    within(menu).getByRole('menuitemradio', { name: 'Auto' }),
  ).toHaveAttribute('aria-checked', 'true');
  await user.click(within(menu).getByRole('menuitemradio', { name: 'Plan' }));
  expect(screen.queryByRole('menu', { name: 'Permission mode' })).toBeNull();
  expect(screen.getByRole('button', { name: '[ Plan ]' })).toBeInTheDocument();
  expect(localStorage.getItem('mode')).toBe('plan');
  expect(agent.setPermission).toHaveBeenCalledWith(runId, 'plan');
  await sendPrompt(user, 'more');
  expect(agent.send.mock.lastCall![6]).toBe('plan');

  cleanup();
  const again = await open();
  await sendPrompt(again, 'later');
  expect(agent.send.mock.lastCall![6]).toBe('plan');
});

const permissionCards = () =>
  screen.queryAllByRole('group', { name: 'Permission request' });

it('answers a pending question with the picked options instead of allow or deny', async () => {
  const user = await running();
  const runId = lastRunId();
  const input = {
    questions: [
      {
        question: 'Which workspace?',
        header: 'Workspace',
        multiSelect: false,
        options: [
          { label: 'Env var', description: 'Skip the dialog.' },
          { label: 'Inspector', description: 'Patch main.' },
        ],
      },
      {
        question: 'Which suites?',
        header: 'Scope',
        multiSelect: true,
        options: [
          { label: 'CLI', description: '' },
          { label: 'Vitest', description: '' },
        ],
      },
    ],
  };
  act(() => emit({ type: 'tool', id: 'tu', name: 'AskUserQuestion', input }));
  act(() =>
    emit({
      type: 'permission',
      request: { id: 'r1', toolUseId: 'tu', tool: 'AskUserQuestion', input },
    }),
  );
  expect(permissionCards()).toHaveLength(0);
  const [box] = screen.getAllByRole('group', { name: 'Questions' });
  const submit = within(box).getByRole('button', { name: '[ SUBMIT ]' });
  const [ownWay, otherSuite] = within(box).getAllByRole('textbox', {
    name: 'Other',
  });
  await user.click(within(box).getByRole('radio', { name: /Inspector/ }));
  expect(submit).toBeDisabled();
  await user.type(ownWay, 'My own way');
  expect(
    within(box).getByRole('radio', { name: /Inspector/ }),
  ).not.toBeChecked();
  await user.click(within(box).getByRole('checkbox', { name: /CLI/ }));
  await user.type(otherSuite, 'Playwright');
  await user.click(submit);
  const answers = {
    'Which workspace?': 'My own way',
    'Which suites?': 'CLI, Playwright',
  };
  expect(agent.answerPermission).toHaveBeenCalledWith(
    runId,
    'r1',
    true,
    answers,
  );
  expect(screen.getAllByRole('group', { name: 'Questions' })).toHaveLength(1);
  expect(screen.queryByRole('radio')).toBeNull();

  act(() => emit({ type: 'answers', id: 'tu', answers }));
  const answered = screen.getByRole('group', { name: 'Questions' });
  expect(
    [...answered.querySelectorAll('[data-answer]')].map((e) => e.textContent),
  ).toEqual(['03My own way', '01CLI', '03Playwright']);
});

it('skips a pending question by denying it', async () => {
  const user = await running();
  const input = {
    questions: [
      {
        question: 'Which?',
        header: 'Pick',
        options: [{ label: 'A', description: '' }],
      },
    ],
  };
  act(() =>
    emit({
      type: 'permission',
      request: { id: 'r1', toolUseId: 'tu', tool: 'AskUserQuestion', input },
    }),
  );
  await user.click(screen.getByRole('button', { name: '[ SKIP ]' }));
  expect(agent.answerPermission).toHaveBeenCalledWith(
    lastRunId(),
    'r1',
    false,
    undefined,
  );
});

it('asks to allow a tool call and sends the answer', async () => {
  const user = await running();
  const runId = lastRunId();
  act(() =>
    emit({
      type: 'permission',
      request: {
        id: 'r1',
        toolUseId: 'tr1',
        tool: 'Bash',
        input: { command: 'rm -rf x\nmore' },
      },
    }),
  );
  const [card] = permissionCards();
  expect(card).toHaveTextContent('Bash');
  expect(card).toHaveTextContent('rm -rf x');
  expect(card.textContent).not.toMatch(/more/);
  await user.click(within(card).getByRole('button', { name: '[ ALLOW ]' }));
  expect(agent.answerPermission).toHaveBeenCalledWith(
    runId,
    'r1',
    true,
    undefined,
  );
  expect(permissionCards()).toHaveLength(0);

  act(() =>
    emit({
      type: 'permission',
      request: {
        id: 'r2',
        toolUseId: 'tr2',
        tool: 'Write',
        input: { file_path: '/src/a.ts' },
        title: 'Claude wants to write to a.ts',
      },
    }),
  );
  const [titled] = permissionCards();
  expect(titled).toHaveTextContent('Write');
  expect(titled).toHaveTextContent('Claude wants to write to a.ts');
  expect(titled).not.toHaveTextContent('/src/a.ts');
  await user.click(within(titled).getByRole('button', { name: '[ DENY ]' }));
  expect(agent.answerPermission).toHaveBeenLastCalledWith(
    runId,
    'r2',
    false,
    undefined,
  );
  expect(permissionCards()).toHaveLength(0);
});

it.each([
  ['goes idle', { type: 'state', state: 'idle' }],
  ['ends', { type: 'end' }],
] as [string, AgentEvent][])(
  'drops permission cards once answered elsewhere or the session %s',
  async (_, event) => {
    await running();
    act(() =>
      emit({
        type: 'permission',
        request: {
          id: 'r1',
          toolUseId: 'tr1',
          tool: 'Bash',
          input: { command: 'ls' },
        },
      }),
    );
    act(() =>
      emit({
        type: 'permission',
        request: {
          id: 'r2',
          toolUseId: 'tr2',
          tool: 'Read',
          input: { file_path: '/x' },
        },
      }),
    );
    act(() =>
      emit({
        type: 'permission',
        request: {
          id: 'r3',
          toolUseId: 'tr3',
          tool: 'Grep',
          input: { pattern: 'y' },
        },
      }),
    );
    expect(permissionCards().map((c) => c.textContent)).toEqual([
      expect.stringContaining('Bash'),
      expect.stringContaining('Read'),
      expect.stringContaining('Grep'),
    ]);
    act(() => emit({ type: 'permission-end', id: 'r2' }));
    expect(permissionCards().map((c) => c.textContent)).toEqual([
      expect.stringContaining('Bash'),
      expect.stringContaining('Grep'),
    ]);
    await act(async () => emit(event));
    expect(permissionCards()).toHaveLength(0);
  },
);

it('marks a thread as waiting while a tool call needs permission', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await running();
  const dot = () =>
    row(/Newest/).getByLabelText(/^(attention|running)$/).ariaLabel;
  expect(dot()).toBe('running');
  act(() =>
    emit({
      type: 'permission',
      request: {
        id: 'r1',
        toolUseId: 'tr1',
        tool: 'Bash',
        input: { command: 'ls' },
      },
    }),
  );
  expect(dot()).toBe('attention');
  expect(screen.queryByRole('status', { name: 'Working' })).toBeNull();
  await user.click(screen.getByRole('button', { name: '[ ALLOW ]' }));
  expect(dot()).toBe('running');
  expect(screen.getByRole('status', { name: 'Working' })).toBeInTheDocument();
});

it('opens the mode menu and usage one at a time and closes them on Escape or outside click', async () => {
  agent.usage.mockResolvedValue(null);
  const user = await open();
  const button = screen.getByRole('button', { name: '[ Auto ]' });
  const settings = () =>
    screen.queryByRole('menu', { name: 'Permission mode' });
  const usage = () => screen.queryByRole('dialog', { name: 'Usage' });

  expect(button).toHaveAttribute('aria-expanded', 'false');
  await user.click(button);
  expect(settings()).toBeInTheDocument();
  expect(button).toHaveAttribute('aria-expanded', 'true');
  await user.click(button);
  expect(settings()).toBeNull();

  await user.click(button);
  await user.keyboard('{Escape}');
  expect(settings()).toBeNull();

  await user.click(button);
  await user.click(screen.getByRole('heading', { level: 1 }));
  expect(settings()).toBeNull();

  await user.click(button);
  await user.click(screen.getByRole('button', { name: 'Usage' }));
  expect(settings()).toBeNull();
  expect(usage()).toBeInTheDocument();
  await user.click(button);
  expect(usage()).toBeNull();
  expect(settings()).toBeInTheDocument();
});

it('moves through the mode menu from the keyboard', async () => {
  const user = await open();
  const button = screen.getByRole('button', { name: '[ Auto ]' });
  await user.click(button);
  const item = (name: string) => screen.getByRole('menuitemradio', { name });
  expect(item('Auto')).toHaveFocus();
  await user.keyboard('{ArrowUp}');
  expect(item('Bypass')).toHaveFocus();
  await user.keyboard('{ArrowDown}{ArrowDown}');
  expect(item('Ask')).toHaveFocus();
  await user.hover(item('Plan'));
  expect(item('Plan')).toHaveFocus();
  expect(item('Ask')).not.toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).toBeNull();
  expect(button).toHaveFocus();

  await user.click(button);
  item('Bypass').focus();
  await user.tab();
  expect(screen.queryByRole('menu')).toBeNull();
});

it('keeps a pending permission when another thread finishes', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  await sendPrompt(user, 'first');
  const runB = lastRunId();
  act(() =>
    emit({
      type: 'permission',
      request: {
        id: 'r1',
        toolUseId: 'tr1',
        tool: 'Bash',
        input: { command: 'ls' },
      },
    }),
  );
  await user.click(screen.getByRole('button', { name: /Older/ }));
  await sendPrompt(user, 'second');
  await act(async () => finishRun());
  await user.click(screen.getByRole('button', { name: /Newest/ }));
  expect(permissionCards()).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: '[ ALLOW ]' }));
  expect(agent.answerPermission).toHaveBeenCalledWith(
    runB,
    'r1',
    true,
    undefined,
  );
});

it('hides the working wave while waiting for permission', async () => {
  const user = await running();
  const wave = () => screen.queryByRole('status', { name: 'Working' });
  expect(wave()).toBeInTheDocument();
  act(() =>
    emit({
      type: 'permission',
      request: {
        id: 'r1',
        toolUseId: 'tr1',
        tool: 'Bash',
        input: { command: 'ls' },
      },
    }),
  );
  expect(wave()).toBeNull();
  await user.click(screen.getByRole('button', { name: '[ ALLOW ]' }));
  expect(wave()).toBeInTheDocument();
});

it('shows the project todos, edits them and follows changes on disk', async () => {
  let change: (cwd: string, todos: Todo[]) => void = () => undefined;
  todos.onChange.mockImplementation((l) => {
    change = l;
    return () => undefined;
  });
  todos.watch.mockResolvedValue([{ line: 0, text: 'ship', done: false }]);
  todos.edit.mockResolvedValue([
    { line: 0, text: 'ship', done: false },
    { line: 1, text: 'docs', done: false },
  ]);
  const user = await open();
  expect(todos.watch).toHaveBeenCalledWith('/proj');
  await user.click(await screen.findByRole('checkbox', { name: 'ship' }));
  expect(todos.edit).toHaveBeenCalledWith('/proj', {
    type: 'toggle',
    todo: { line: 0, text: 'ship', done: false },
  });
  await user.type(screen.getByLabelText('New todo'), 'docs{Enter}');
  expect(todos.edit).toHaveBeenLastCalledWith('/proj', {
    type: 'add',
    text: 'docs',
  });
  expect(screen.getByLabelText('New todo')).toHaveValue('');
  await screen.findByRole('checkbox', { name: 'docs' });
  act(() => change('/other', []));
  expect(screen.getByRole('checkbox', { name: 'docs' })).toBeInTheDocument();
  act(() => change('/proj', [{ line: 0, text: 'ship', done: true }]));
  expect(screen.getByRole('checkbox', { name: 'ship' })).toBeChecked();
  expect(screen.queryByRole('checkbox', { name: 'docs' })).toBeNull();
});

const todoRow = (name: string) =>
  screen.getByRole('checkbox', { name }).closest('li')!;

function transfer(data: Record<string, string> = {}) {
  return {
    setData: (type: string, value: string) => (data[type] = value),
    getData: (type: string) => data[type] ?? '',
    get types() {
      return Object.keys(data);
    },
    effectAllowed: 'all',
    dropEffect: 'none',
  };
}

async function openWithTodos(list: Todo[]) {
  todos.watch.mockResolvedValue(list);
  todos.edit.mockResolvedValue(list);
  const user = await open();
  await screen.findByRole('checkbox', { name: list[0].text });
  return { user, edit: todos.edit };
}

it('toggles the todo panel from its icon button and the separator lines', async () => {
  const user = await open();
  const toggle = screen.getByRole('button', { name: 'Hide todos' });
  expect(toggle.querySelector('svg.lucide')).not.toBeNull();
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await user.click(toggle);
  expect(toggle).toHaveAccessibleName('Show todos');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const line = toggle.parentElement!.firstElementChild!;
  await user.click(line);
  expect(toggle).toHaveAccessibleName('Hide todos');
  fireEvent.pointerDown(line, { clientX: 100, clientY: 100 });
  fireEvent.pointerMove(line, { clientX: 140, clientY: 100 });
  fireEvent.pointerUp(line, { clientX: 140, clientY: 100 });
  fireEvent.click(line, { clientX: 140, clientY: 100, detail: 1 });
  expect(toggle).toHaveAccessibleName('Hide todos');
});

it('keeps the panel snap animation running for the full duration after a second toggle', async () => {
  await open();
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const toggle = screen.getByRole('button', { name: 'Hide todos' });
  const snapping = () => document.querySelector('[data-snap]') !== null;
  expect(snapping()).toBe(false);
  fireEvent.click(toggle);
  expect(snapping()).toBe(true);
  act(() => vi.advanceTimersByTime(150));
  fireEvent.click(toggle);
  act(() => vi.advanceTimersByTime(150));
  expect(snapping()).toBe(true);
  act(() => vi.advanceTimersByTime(50));
  expect(snapping()).toBe(false);
  fireEvent.click(toggle);
  const timers = vi.getTimerCount();
  cleanup();
  expect(vi.getTimerCount()).toBe(timers - 1);
});

it('shows the platform shortcut on the todo toggle', async () => {
  await open();
  expect(screen.getByRole('button', { name: 'Hide todos' })).toHaveAttribute(
    'title',
    'Toggle todos (Ctrl+T)',
  );
  cleanup();
  const ua = vi
    .spyOn(navigator, 'userAgent', 'get')
    .mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Electron/40.0.0',
    );
  onTestFinished(() => ua.mockRestore());
  await open();
  expect(screen.getByRole('button', { name: 'Hide todos' })).toHaveAttribute(
    'title',
    'Toggle todos (⌘T)',
  );
});

it('starts with the todo panel closed when the saved layout collapsed it', async () => {
  localStorage.setItem(
    'react-resizable-panels:todos',
    JSON.stringify({ main: 100, todos: 0 }),
  );
  await open();
  expect(screen.getByRole('button', { name: 'Show todos' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

it('toggles the todo panel with Ctrl+T, even from the composer', async () => {
  const user = await open();
  const box = screen.getByPlaceholderText('Ask the agent…');
  await user.click(box);
  await user.keyboard('{Control>}t{/Control}');
  expect(screen.getByRole('button', { name: 'Show todos' })).toBeVisible();
  expect(box).toHaveValue('');
  await user.keyboard('{Meta>}t{/Meta}');
  expect(screen.getByRole('button', { name: 'Hide todos' })).toBeVisible();
});

it('lists done todos after open ones and says when there are none', async () => {
  await openWithTodos([
    { line: 0, text: 'old', done: true },
    { line: 1, text: 'next', done: false },
    { line: 2, text: 'later', done: false },
  ]);
  expect(
    screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label')),
  ).toEqual(['next', 'later', 'old']);
  act(() => todos.onChange.mock.lastCall![0]('/proj', []));
  expect(screen.getByText('NO TODOS')).toBeInTheDocument();
});

it('renames a todo inline', async () => {
  const ship = { line: 0, text: 'ship', done: false };
  const { user, edit } = await openWithTodos([ship]);
  await user.dblClick(screen.getByText('ship'));
  const input = screen.getByRole('textbox', { name: 'Rename ship' });
  expect(input).toHaveValue('ship');
  expect(input).toHaveFocus();
  await user.type(input, ' it{Enter}');
  expect(edit).toHaveBeenLastCalledWith('/proj', {
    type: 'rename',
    todo: ship,
    text: 'ship it',
  });
  expect(screen.queryByRole('textbox', { name: 'Rename ship' })).toBeNull();
  edit.mockClear();
  await user.dblClick(screen.getByText('ship'));
  await user.type(screen.getByLabelText('Rename ship'), ' no{Escape}');
  expect(screen.queryByLabelText('Rename ship')).toBeNull();
  expect(edit).not.toHaveBeenCalled();
  await user.dblClick(screen.getByText('ship'));
  await user.type(screen.getByLabelText('Rename ship'), ' later');
  await user.click(screen.getByLabelText('New todo'));
  expect(edit).toHaveBeenLastCalledWith('/proj', {
    type: 'rename',
    todo: ship,
    text: 'ship later',
  });
});

it('reorders todos by dragging them within their group', async () => {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((text, line) => ({
    line,
    text,
    done: text === 'd',
  }));
  const { edit } = await openWithTodos([a, b, c, d]);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    bottom: 20,
    height: 20,
  } as DOMRect);
  const drag = (from: string, to: string, clientY: number) => {
    const dataTransfer = transfer();
    fireEvent.dragStart(todoRow(from), { dataTransfer });
    fireEvent.dragOver(todoRow(to), { dataTransfer, clientY });
    const drop = todoRow(to).getAttribute('data-drop');
    const dragging = todoRow(from).hasAttribute('data-dragging');
    fireEvent.drop(todoRow(to), { dataTransfer, clientY });
    fireEvent.dragEnd(todoRow(from), { dataTransfer });
    return { drop, dragging };
  };
  expect(drag('c', 'a', 5)).toEqual({ drop: 'before', dragging: true });
  expect(edit).toHaveBeenLastCalledWith('/proj', {
    type: 'move',
    todo: c,
    before: a,
  });
  expect(drag('a', 'b', 15)).toEqual({ drop: 'after', dragging: true });
  expect(edit).toHaveBeenLastCalledWith('/proj', {
    type: 'move',
    todo: a,
    before: c,
  });
  drag('a', 'c', 15);
  expect(edit).toHaveBeenLastCalledWith('/proj', {
    type: 'move',
    todo: a,
    before: undefined,
  });
  expect(todoRow('a')).not.toHaveAttribute('data-dragging');
  edit.mockClear();
  expect(drag('a', 'd', 5).drop).toBeNull();
  expect(edit).not.toHaveBeenCalled();
});

it('binds the drag end listeners once per drag', async () => {
  await openWithTodos([{ line: 0, text: 'ship', done: false }]);
  const add = vi.spyOn(window, 'addEventListener');
  onTestFinished(() => add.mockRestore());
  const dataTransfer = transfer();
  fireEvent.dragStart(todoRow('ship'), { dataTransfer });
  const zone = screen.getByText('[ + NEW THREAD ]');
  fireEvent.dragOver(zone, { dataTransfer });
  fireEvent.dragLeave(zone, { dataTransfer });
  fireEvent.dragOver(zone, { dataTransfer });
  fireEvent.dragEnd(todoRow('ship'), { dataTransfer });
  expect(add.mock.calls.filter(([type]) => type === 'dragend')).toHaveLength(1);
});

it('ends the drag when its todo leaves the list mid-drag', async () => {
  await openWithTodos([
    { line: 0, text: 'ship', done: false },
    { line: 1, text: 'docs', done: false },
  ]);
  const dataTransfer = transfer();
  fireEvent.dragStart(todoRow('ship'), { dataTransfer });
  const zone = () => screen.queryByText('[ + NEW THREAD ]');
  fireEvent.dragOver(zone()!, { dataTransfer });
  act(() =>
    todos.onChange.mock.lastCall![0]('/proj', [
      { line: 0, text: 'docs', done: false },
    ]),
  );
  expect(zone()).toBeNull();
  fireEvent.dragStart(todoRow('docs'), { dataTransfer });
  expect(zone()).not.toHaveAttribute('data-over');
});

it('copies a todo dropped on the chat into the composer', async () => {
  const { user, edit } = await openWithTodos([
    { line: 0, text: 'ship', done: false },
  ]);
  const box = screen.getByPlaceholderText('Ask the agent…');
  const dropShip = () => {
    const dataTransfer = transfer();
    fireEvent.dragStart(todoRow('ship'), { dataTransfer });
    const handled = !fireEvent.drop(box, { dataTransfer });
    fireEvent.dragEnd(todoRow('ship'), { dataTransfer });
    return handled;
  };
  expect(dropShip()).toBe(true);
  expect(box).toHaveValue('ship');
  expect(box).toHaveFocus();
  await user.clear(box);
  await user.type(box, 'draft');
  box.blur();
  dropShip();
  expect(box).toHaveValue('draft\nship');
  expect(box).toHaveFocus();
  expect(edit).not.toHaveBeenCalled();
  expect(screen.getByRole('checkbox', { name: 'ship' })).toBeInTheDocument();
});

it('ignores plain text dropped on the chat', async () => {
  await open();
  const box = screen.getByPlaceholderText('Ask the agent…');
  const dataTransfer = transfer({ 'text/plain': 'hello' });
  expect(fireEvent.dragOver(box, { dataTransfer })).toBe(true);
  expect(fireEvent.drop(box, { dataTransfer })).toBe(true);
  expect(box).toHaveValue('');
});

it('starts a new thread from a todo dropped on the new thread zone', async () => {
  const { user } = await openWithTodos([
    { line: 0, text: 'ship', done: false },
  ]);
  const zone = () => screen.queryByText('[ + NEW THREAD ]');
  expect(zone()).toBeNull();
  let dataTransfer = transfer();
  fireEvent.dragStart(todoRow('ship'), { dataTransfer });
  expect(zone()).toBeInTheDocument();
  fireEvent.dragEnd(todoRow('ship'), { dataTransfer });
  expect(zone()).toBeNull();

  await user.type(screen.getByPlaceholderText('Ask the agent…'), 'busy');
  dataTransfer = transfer();
  fireEvent.dragStart(todoRow('ship'), { dataTransfer });
  fireEvent.dragOver(zone()!, { dataTransfer });
  expect(zone()).toHaveAttribute('data-over');
  fireEvent.drop(zone()!, { dataTransfer });
  expect(zone()).toBeNull();
  expect(sidebarTitles()).toEqual(['New thread', 'New thread']);
  const box =
    screen.getByPlaceholderText<HTMLTextAreaElement>('Ask the agent…');
  expect(box).toHaveValue('ship');
  expect(box).toHaveFocus();
  expect([box.selectionStart, box.selectionEnd]).toEqual([4, 4]);
});

it('fills the empty draft from a todo dropped on the new thread zone', async () => {
  await openWithTodos([{ line: 0, text: 'ship', done: false }]);
  const dataTransfer = transfer();
  fireEvent.dragStart(todoRow('ship'), { dataTransfer });
  fireEvent.drop(screen.getByText('[ + NEW THREAD ]'), { dataTransfer });
  expect(sidebarTitles()).toEqual(['New thread']);
  const box =
    screen.getByPlaceholderText<HTMLTextAreaElement>('Ask the agent…');
  expect(box).toHaveValue('ship');
  expect(box).toHaveFocus();
  expect([box.selectionStart, box.selectionEnd]).toEqual([4, 4]);
});

it('marks the chat as a drop target while a todo is dragged', async () => {
  await openWithTodos([{ line: 0, text: 'ship', done: false }]);
  const target = () =>
    screen.queryByText('[ + ADD TO PROMPT ]')?.parentElement ?? null;
  expect(target()).toBeNull();
  const dataTransfer = transfer();
  fireEvent.dragStart(todoRow('ship'), { dataTransfer });
  expect(target()).toBeInTheDocument();
  expect(target()).not.toHaveAttribute('data-over');
  const box = screen.getByPlaceholderText('Ask the agent…');
  fireEvent.dragOver(box, { dataTransfer });
  expect(target()).toHaveAttribute('data-over');
  fireEvent.dragOver(screen.getByText('[ + NEW THREAD ]'), { dataTransfer });
  expect(target()).not.toHaveAttribute('data-over');
  fireEvent.dragOver(box, { dataTransfer });
  fireEvent.drop(box, { dataTransfer });
  expect(target()).toBeNull();
  expect(box).toHaveValue('ship');
});
