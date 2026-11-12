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
import type {
  AgentEvent,
  BacklogEntry,
  BacklogApi,
  TerminalApi,
} from './agent-types';

// jsdom has no canvas, so the terminal records what it is asked to show.
const screenText: string[] = [];
let typeInTerminal: (data: string) => void;
let restyled = 0;
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}));
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    options = {
      set theme(_: unknown) {
        restyled++;
      },
    };
    loadAddon() {}
    open() {}
    focus() {}
    dispose() {}
    write(data: string) {
      if (data) screenText.push(data);
    }
    onData(fn: (data: string) => void) {
      typeInTerminal = fn;
      return { dispose() {} };
    }
    onResize() {
      return { dispose() {} };
    }
  },
}));

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
  onCatalogChange: vi.fn(),
  paths: vi.fn(),
  setPermission: vi.fn(),
  answerPermission: vi.fn(),
  branch: vi.fn(),
  createWorktree: vi.fn(),
  mergeWorktree: vi.fn(),
  setupCommand: vi.fn(),
};
let catalogListener: (cwd: string) => void;
const update = { check: vi.fn(), install: vi.fn() };
const backlog = {
  watch: vi.fn<BacklogApi['watch']>(),
  edit: vi.fn<BacklogApi['edit']>(),
  onChange: vi.fn<BacklogApi['onChange']>(),
};
const terminal = {
  open: vi.fn<TerminalApi['open']>(),
  write: vi.fn<TerminalApi['write']>(),
  resize: vi.fn<TerminalApi['resize']>(),
  close: vi.fn<TerminalApi['close']>(),
  onData: vi.fn<TerminalApi['onData']>(),
  onExit: vi.fn<TerminalApi['onExit']>(),
};

beforeEach(() => {
  vi.clearAllMocks();
  agent.pickWorkspace.mockResolvedValue('/proj');
  agent.listThreads.mockResolvedValue([]);
  agent.loadThread.mockResolvedValue([]);
  agent.deleteThread.mockResolvedValue(undefined);
  agent.paths.mockResolvedValue({});
  agent.branch.mockResolvedValue('main');
  agent.setupCommand.mockResolvedValue(null);
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
  backlog.watch.mockResolvedValue([]);
  backlog.edit.mockReset();
  backlog.onChange.mockImplementation(() => () => undefined);
  window.backlog = backlog;
  agent.onCatalogChange.mockImplementation((l) => {
    catalogListener = l;
    return () => undefined;
  });
  update.check.mockResolvedValue({ commits: [] });
  update.install.mockReset().mockResolvedValue(undefined);
  window.update = update;
  screenText.length = 0;
  terminal.open.mockResolvedValue('');
  terminal.onData.mockImplementation(() => () => undefined);
  terminal.onExit.mockImplementation(() => () => undefined);
  window.terminal = terminal;
  Element.prototype.scrollIntoView = () => undefined;
});

const now = Date.now();
const list = [
  { id: 'b', title: 'Newest', createdAt: now - 1, updatedAt: now - 1 },
  { id: 'a', title: 'Older', createdAt: now - 2, updatedAt: now - 2 },
];

const sidebarTitles = () =>
  within(screen.getByRole('navigation'))
    .getAllByRole('button')
    .filter((b) => !b.closest('h2'))
    .map((b) => b.textContent)
    .filter((t) => t && t !== '[ CONFIRM ]');

const heading = () => screen.getByRole('heading', { level: 1 }).textContent;

async function open() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    await screen.findByRole('button', { name: '[ OPEN FOLDER ]' }),
  );
  await screen.findByRole('navigation');
  return user;
}

async function restart() {
  cleanup();
  const user = userEvent.setup();
  render(<App />);
  expect(screen.queryByRole('button', { name: '[ OPEN FOLDER ]' })).toBeNull();
  await screen.findByRole('navigation');
  return user;
}

async function openAnother(user: User, cwd: string) {
  agent.pickWorkspace.mockResolvedValue(cwd);
  await user.click(screen.getByRole('button', { name: '[ + PROJECT ]' }));
}

async function sendPrompt(user: User, text: string) {
  await user.type(
    screen.getByPlaceholderText('Ask the agent…'),
    `${text}{Enter}`,
  );
}

const row = (title: RegExp) =>
  within(screen.getByRole('button', { name: title }).parentElement!);

async function remove(user: User, title: RegExp) {
  await user.click(row(title).getByRole('button', { name: 'Delete' }));
  await user.click(row(title).getByRole('button', { name: '[ CONFIRM ]' }));
}

async function running() {
  const user = await open();
  await sendPrompt(user, 'go');
  return user;
}

const finish = async () => {
  act(() => emit({ type: 'done', ok: true, result: 'ok' }));
  await act(async () => finishRun());
};

const permissionCards = () =>
  screen.queryAllByRole('group', { name: 'Permission request' });

const permission = (
  id: string,
  tool = 'Bash',
  input: object = { command: 'ls' },
) =>
  emit({
    type: 'permission',
    request: { id, toolUseId: `t${id}`, tool, input },
  });

const withOldest = [
  ...list,
  { id: 'c', title: 'Oldest', createdAt: now - 3, updatedAt: now - 3 },
];

const entryRow = (name: string) =>
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

async function openWithBacklog(list: BacklogEntry[]) {
  backlog.watch.mockResolvedValue(list);
  backlog.edit.mockResolvedValue(list);
  const user = await open();
  await screen.findByRole('checkbox', { name: list[0].text });
  return { user, edit: backlog.edit };
}

it('opens the folder it was launched with as one empty draft', async () => {
  history.replaceState(null, '', '?workspace=%2Flaunched');
  render(<App />);
  await screen.findByRole('navigation');
  history.replaceState(null, '', '/');
  expect(agent.pickWorkspace).not.toHaveBeenCalled();
  expect(agent.listThreads).toHaveBeenCalledWith('/launched');
  expect(sidebarTitles()).toEqual(['New thread']);
  expect(screen.getByText('NO MESSAGES YET')).toBeInTheDocument();
  expect(agent.loadThread).not.toHaveBeenCalled();
});

it('starts and stays usable when saved state is unparseable', async () => {
  for (const key of ['projects', 'archived', 'context', 'model', 'models'])
    localStorage.setItem(key, 'not json{');
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  expect(sidebarTitles()).toEqual(['Newest', 'Older']);
  await sendPrompt(user, 'still works');
  expect(agent.send).toHaveBeenLastCalledWith(
    expect.any(String),
    'still works',
    [],
    '/proj',
    'b',
    { model: 'opus' },
    'auto',
    expect.any(String),
  );
});

it('lists sessions, opens the newest folded to its answer and loads each thread once', async () => {
  localStorage.setItem('context', JSON.stringify({ a: 33 }));
  agent.listThreads.mockResolvedValue(list);
  agent.loadThread.mockImplementation(async (id: string) =>
    id === 'b'
      ? [
          { type: 'user', text: 'old prompt' },
          { type: 'text', text: 'old answer' },
          {
            type: 'tool',
            id: 'tu',
            name: 'Read',
            input: { file_path: 'x.ts' },
          },
          { type: 'text', text: 'final answer' },
        ]
      : [{ type: 'text', text: `body ${id}` }],
  );
  const user = await open();
  expect(agent.listThreads).toHaveBeenCalledWith('/proj');
  expect(sidebarTitles()).toEqual(['Newest', 'Older']);
  expect(heading()).toBe('Newest');
  expect(await screen.findByText('final answer')).toBeInTheDocument();
  expect(screen.getByText('old prompt')).toBeInTheDocument();
  expect(screen.queryByText('old answer')).toBeNull();
  expect(screen.queryByText('x.ts')).toBeNull();
  expect(
    screen.getByRole('button', { name: '[ SHOW THINKING ]' }),
  ).toBeTruthy();

  await user.click(screen.getByRole('button', { name: /Older/ }));
  expect(await screen.findByText('body a')).toBeInTheDocument();
  expect(screen.getByText('33% USED')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Newest/ }));
  await user.click(screen.getByRole('button', { name: /Older/ }));
  expect(screen.getByText('body a')).toBeInTheDocument();
  expect(agent.loadThread.mock.calls).toEqual([
    ['b', '/proj'],
    ['a', '/proj'],
  ]);
});

it('shows a load failure in the chat', async () => {
  agent.listThreads.mockResolvedValue(list);
  agent.loadThread.mockRejectedValue(new Error('transcript missing'));
  await open();
  expect(await screen.findByText('transcript missing')).toBeInTheDocument();
});

it('attaches pasted images, keeps them with a draft and sends them', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  await user.keyboard('{Control>}n{/Control}');
  const paste = (file = new File(['png'], 'shot.png', { type: 'image/png' })) =>
    fireEvent.paste(screen.getByPlaceholderText('Ask the agent…'), {
      clipboardData: { files: [file] },
    });
  const removeImage = () =>
    screen.queryByRole('button', { name: 'Remove image' });

  paste(
    new File([new Uint8Array(4 * 1024 * 1024)], 'big.png', {
      type: 'image/png',
    }),
  );
  expect(screen.getByText(/IMAGE OVER 5 MB/)).toBeInTheDocument();
  expect(removeImage()).toBeNull();

  paste();
  await user.click(await screen.findByRole('button', { name: 'Remove image' }));
  expect(removeImage()).toBeNull();
  paste();
  await screen.findByRole('button', { name: 'Remove image' });
  await user.click(screen.getByRole('button', { name: /Older/ }));
  expect(removeImage()).toBeNull();
  expect(row(/New thread/).getByLabelText('draft')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /New thread/ }));
  expect(removeImage()).toBeInTheDocument();

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
  expect(removeImage()).toBeNull();
});

it('swaps a draft to its session id and refreshes the list after the run', async () => {
  agent.listThreads.mockResolvedValueOnce(list);
  agent.loadThread.mockResolvedValue([{ type: 'text', text: 'old answer' }]);
  const user = await open();
  await user.keyboard('{Control>}n{/Control}');
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
    { id: 'sid', title: 'Summarised title', createdAt: now, updatedAt: now },
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

  await user.type(
    screen.getByPlaceholderText('Ask the agent…'),
    'second{Shift>}{Enter}{/Shift}prompt{Enter}',
  );
  expect(agent.send).toHaveBeenLastCalledWith(
    runId,
    'second\nprompt',
    [],
    '/proj',
    'sid',
    { model: 'opus' },
    'auto',
    expect.any(String),
  );
});

it('keeps drafts with text at the top and drops untouched ones', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  const composer = () => screen.getByPlaceholderText('Ask the agent…');
  await user.click(screen.getByRole('button', { name: /Older/ }));
  await sendPrompt(user, 'go');
  await user.keyboard('{Control>}n{/Control}');
  expect(composer()).toHaveFocus();
  expect(sidebarTitles()).toEqual(['New thread', 'Newest', 'Older']);
  await user.keyboard('{Control>}n{/Control}');
  expect(composer()).toHaveFocus();
  expect(sidebarTitles()).toEqual(['New thread', 'Newest', 'Older']);
  await user.click(screen.getByRole('button', { name: /Newest/ }));
  expect(sidebarTitles()).toEqual(['Newest', 'Older']);

  await user.keyboard('{Control>}n{/Control}');
  await user.type(composer(), 'half typed');
  await user.click(screen.getByRole('button', { name: /Newest/ }));
  expect(sidebarTitles()).toEqual(['New thread', 'Newest', 'Older']);
  expect(row(/New thread/).getByLabelText('draft')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /New thread/ }));
  expect(composer()).toHaveValue('half typed');

  await remove(user, /New thread/);
  expect(agent.deleteThread).not.toHaveBeenCalled();
  expect(sidebarTitles()).toEqual(['Newest', 'Older']);
  expect(heading()).toBe('Newest');
});

it('deletes threads after confirmation, moving to the next one or a fresh draft', async () => {
  agent.listThreads.mockResolvedValue(withOldest);
  localStorage.setItem('context', JSON.stringify({ a: 33, b: 50 }));
  agent.loadThread.mockImplementation(async (id: string) => [
    { type: 'text', text: `body ${id}` },
  ]);
  const user = await open();
  await screen.findByText('body b');
  const confirm = () =>
    row(/Older/).queryByRole('button', { name: '[ CONFIRM ]' });
  for (const cancel of [
    () => user.hover(screen.getByRole('button', { name: /Newest/ })),
    () => user.keyboard('{Escape}'),
    () => user.click(screen.getByRole('button', { name: /Newest/ })),
  ]) {
    await user.click(row(/Older/).getByRole('button', { name: 'Delete' }));
    expect(confirm()).toBeTruthy();
    await cancel();
    expect(confirm()).toBeNull();
    expect(row(/Older/).getByRole('button', { name: 'Delete' })).toBeTruthy();
  }
  expect(agent.deleteThread).not.toHaveBeenCalled();

  await remove(user, /Older/);
  expect(agent.deleteThread).toHaveBeenCalledWith('a', '/proj', undefined);
  expect(JSON.parse(localStorage.getItem('context')!)).toEqual({ b: 50 });
  expect(sidebarTitles()).toEqual(['Newest', 'Oldest']);
  expect(heading()).toBe('Newest');

  await remove(user, /Newest/);
  expect(heading()).toBe('Oldest');
  expect(await screen.findByText('body c')).toBeInTheDocument();

  await remove(user, /Oldest/);
  expect(sidebarTitles()).toEqual(['New thread']);
  expect(heading()).toBe('New thread');
  expect(screen.getByText('NO MESSAGES YET')).toBeInTheDocument();
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

it('hides delete on the running thread and closes the live session of a deleted one', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await running();
  const runId = lastRunId();
  expect(row(/Newest/).queryByRole('button', { name: 'Delete' })).toBeNull();
  expect(row(/Older/).getByRole('button', { name: 'Delete' })).toBeTruthy();
  await act(async () => finishRun());
  await remove(user, /Older/);
  expect(agent.close).not.toHaveBeenCalled();
  await remove(user, /Newest/);
  expect(agent.close).toHaveBeenCalledWith(runId);
  expect(agent.deleteThread).toHaveBeenCalledWith('b', '/proj', undefined);
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

it('keeps threads in creation order and clears outcomes once seen', async () => {
  agent.listThreads.mockResolvedValue(withOldest);
  const user = await open();
  const state = (title: RegExp) =>
    row(title).getByLabelText(/^(attention|error|done|running|read)$/)
      .ariaLabel;

  await user.click(screen.getByRole('button', { name: /Oldest/ }));
  await sendPrompt(user, 'go');
  const runC = lastRunId();
  expect(state(/Oldest/)).toBe('running');
  expect(sidebarTitles()).toEqual(['Newest', 'Older', 'Oldest']);

  await user.click(screen.getByRole('button', { name: /Older/ }));
  await sendPrompt(user, 'go');
  act(() => emit({ type: 'error', message: 'boom' }, runC));
  await act(async () => finishRun(runC));
  act(() => emit({ type: 'done', ok: true, result: 'ok' }));
  await act(async () => finishRun());
  expect(state(/Oldest/)).toBe('error');
  expect(state(/Older/)).toBe('done');
  expect(sidebarTitles()).toEqual(['Newest', 'Older', 'Oldest']);

  await user.click(screen.getByRole('button', { name: /Oldest/ }));
  expect(state(/Oldest/)).toBe('read');
  expect(state(/Older/)).toBe('read');
});

it('archives threads untouched since before today, except unmerged worktrees', async () => {
  const day = 86_400_000;
  agent.listThreads.mockResolvedValue([
    { id: 't', title: 'Today', createdAt: now - 2 * day, updatedAt: now - 1 },
    { id: 'y', title: 'Yesterday', createdAt: now - day, updatedAt: now - day },
    {
      id: 'o',
      title: 'Old',
      createdAt: now - 3 * day,
      updatedAt: now - 3 * day,
    },
    {
      id: 'w',
      title: 'Old worktree',
      createdAt: now - 4 * day,
      updatedAt: now - 4 * day,
      worktree: '/proj/.zephyr/worktrees/w',
    },
  ]);
  const user = await open();
  expect(sidebarTitles()).toEqual(['Today', 'Old worktree', '[ ARCHIVED 2 ]']);

  await user.click(screen.getByRole('button', { name: '[ ARCHIVED 2 ]' }));
  expect(sidebarTitles()).toEqual([
    'Today',
    'Old worktree',
    '[ HIDE ARCHIVED ]',
    'Yesterdayproj',
    'Oldproj',
  ]);
});

it('archives a thread by hand and unarchives it to the top, across restarts', async () => {
  agent.listThreads.mockResolvedValue(list);
  let user = await open();
  await user.click(row(/Newest/).getByRole('button', { name: 'Archive' }));
  expect(sidebarTitles()).toEqual(['Older', '[ ARCHIVED 1 ]']);

  user = await restart();
  await user.click(screen.getByRole('button', { name: '[ ARCHIVED 1 ]' }));
  await user.click(row(/Older/).getByRole('button', { name: 'Archive' }));
  await user.click(row(/Older/).getByRole('button', { name: 'Unarchive' }));
  expect(sidebarTitles()).toEqual(['Older', '[ HIDE ARCHIVED ]', 'Newestproj']);

  await restart();
  expect(sidebarTitles()).toEqual(['Older', '[ ARCHIVED 1 ]']);
});

it('pins threads to the top in pin order, safe from auto-archive, across restarts', async () => {
  const day = 86_400_000;
  agent.listThreads.mockResolvedValue([
    ...withOldest,
    { id: 'o', title: 'Old', createdAt: now - day, updatedAt: now - day },
  ]);
  let user = await open();
  expect(sidebarTitles()).toEqual([
    'Newest',
    'Older',
    'Oldest',
    '[ ARCHIVED 1 ]',
  ]);

  await user.click(screen.getByRole('button', { name: '[ ARCHIVED 1 ]' }));
  await user.click(
    row(/Old(Pinned|proj)?$/).getByRole('button', { name: 'Unarchive' }),
  );
  await user.click(
    row(/Old(Pinned|proj)?$/).getByRole('button', { name: 'Pin' }),
  );
  await user.click(row(/Oldest/).getByRole('button', { name: 'Pin' }));
  expect(sidebarTitles()).toEqual(['Old', 'Oldest', 'Newest', 'Older']);
  expect(
    row(/Old(Pinned|proj)?$/).getByRole('img', { name: 'Pinned' }),
  ).toBeTruthy();

  cleanup();
  user = await restart();
  expect(sidebarTitles()).toEqual(['Old', 'Oldest', 'Newest', 'Older']);

  await user.click(row(/Oldest/).getByRole('button', { name: 'Unpin' }));
  await user.click(
    row(/Old(Pinned|proj)?$/).getByRole('button', { name: 'Archive' }),
  );
  expect(sidebarTitles()).toEqual([
    'Newest',
    'Older',
    'Oldest',
    '[ ARCHIVED 1 ]',
  ]);
  await user.click(screen.getByRole('button', { name: '[ ARCHIVED 1 ]' }));
  expect(
    row(/Old(Pinned|proj)?$/).queryByRole('button', { name: 'Pin' }),
  ).toBeNull();
});

it('opens the next listed thread after deleting an unarchived one', async () => {
  agent.listThreads.mockResolvedValue(withOldest);
  const user = await open();
  await user.click(row(/Oldest/).getByRole('button', { name: 'Archive' }));
  await user.click(screen.getByRole('button', { name: '[ ARCHIVED 1 ]' }));
  await user.click(row(/Oldest/).getByRole('button', { name: 'Unarchive' }));
  await user.click(screen.getByRole('button', { name: /Oldest/ }));
  await user.click(row(/Oldest/).getByRole('button', { name: 'Delete' }));
  await user.click(row(/Oldest/).getByRole('button', { name: '[ CONFIRM ]' }));
  expect(sidebarTitles()).toEqual(['Newest', 'Older']);
  expect(heading()).toBe('Newest');
});

it('completes and runs slash commands, picking up skills added while open', async () => {
  agent.pickWorkspace.mockResolvedValue('/skills');
  const user = await open();
  const box = screen.getByPlaceholderText('Ask the agent…');
  await user.type(box, '/');
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
    '/compactSummarize',
    '/review <pr>Review a PR',
  ]);
  await user.keyboard('{ArrowDown}');
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
  await user.clear(box);
  await user.type(box, '/co{Enter}');
  expect(agent.send).toHaveBeenCalledWith(
    expect.any(String),
    '/compact',
    [],
    '/skills',
    undefined,
    { model: 'opus' },
    'auto',
    expect.any(String),
  );

  agent.catalog.mockResolvedValue({
    commands: [{ name: 'deslop', description: 'Clean up', argumentHint: '' }],
    models: [],
  });
  act(() => catalogListener('/skills'));
  await user.type(box, '/');
  expect(
    await screen.findByRole('option', { name: /deslop/ }),
  ).toBeInTheDocument();
});

it('colours valid commands and paths, and tab completes @ paths', async () => {
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
  agent.complete.mockImplementation(
    async (_cwd: string, partial: string) =>
      ({
        'src/c': ['src/components/'],
        'src/components/': ['src/components/chat/', 'src/components/Item.tsx'],
      })[partial] ?? [],
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

  await user.clear(box);
  await user.type(box, 'see @src/c');
  expect(await screen.findByRole('option', { name: '@src/components/' }));
  await user.keyboard('{Tab}');
  expect(box).toHaveValue('see @src/components/');
  await screen.findByRole('option', { name: '@src/components/Item.tsx' });
  await user.keyboard('{ArrowDown}{Tab}');
  expect(box).toHaveValue('see @src/components/Item.tsx ');
  expect(screen.queryByRole('option')).toBeNull();
  expect(agent.complete).toHaveBeenCalledWith('/proj', 'src/c');
  await user.tab();
  expect(box).toHaveFocus();
  await user.tab({ shift: true });
  expect(box).toHaveFocus();
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

it('shows every step while running, then folds the turn to its answer and errors', async () => {
  const user = await running();
  for (const e of [
    { type: 'text', text: 'let me look' },
    {
      type: 'tool',
      id: 't1',
      name: 'Bash',
      input: { command: 'npm test\nmore' },
    },
    { type: 'tool', id: 't2', name: 'Read', input: { file_path: '/src/a.ts' } },
    { type: 'tool', id: 't3', name: 'Grep', input: { pattern: 'foo.*bar' } },
    { type: 'tool', id: 't4', name: 'Mystery', input: { x: 1 } },
    { type: 'error', message: 'exploded' },
    { type: 'text', text: 'all good' },
  ] as AgentEvent[])
    act(() => emit(e));
  const line = (label: string) => screen.getByText(label).parentElement!;
  expect(screen.getByText('let me look')).toBeInTheDocument();
  expect(line('bash')).toHaveTextContent('npm test');
  expect(line('bash').textContent).not.toMatch(/[{}]|more/);
  expect(line('read')).toHaveTextContent('/src/a.ts');
  expect(line('grep')).toHaveTextContent('foo.*bar');
  expect(line('mystery')).toHaveTextContent('{"x":1}');

  await finish();
  expect(screen.getByText('all good')).toBeInTheDocument();
  expect(screen.getByText('exploded')).toBeInTheDocument();
  expect(screen.queryByText('let me look')).toBeNull();
  expect(screen.queryByText('bash')).toBeNull();
  expect(screen.queryByText(/DONE|\$/)).toBeNull();
  await user.click(screen.getByRole('button', { name: '[ SHOW THINKING ]' }));
  expect(screen.getByText('let me look')).toBeInTheDocument();
  expect(screen.getByText('bash')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '[ HIDE THINKING ]' }));
  expect(screen.queryByText('let me look')).toBeNull();
  expect(screen.queryByText('bash')).toBeNull();
});

it('keeps text written in response to a subagent', async () => {
  await running();
  for (const e of [
    {
      type: 'tool',
      id: 'tu',
      name: 'Agent',
      input: { description: 'explore', prompt: 'long' },
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
  expect(screen.getByText('agent').parentElement).toHaveTextContent('explore');
  await finish();
  expect(screen.getByText('subagent says hi')).toBeInTheDocument();
  expect(screen.getByText('task says hi')).toBeInTheDocument();
  expect(screen.getByText('final')).toBeInTheDocument();
  expect(screen.queryByText('after read')).toBeNull();
  expect(screen.queryByText('agent')).toBeNull();
});

it('shows a lone answer without a toggle and a failed run with its reason', async () => {
  const user = await running();
  act(() => emit({ type: 'text', text: 'just an answer' }));
  await finish();
  expect(screen.getByText('just an answer')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /THINKING/ })).toBeNull();
  await sendPrompt(user, 'again');
  act(() => emit({ type: 'done', ok: false, result: 'error_max_turns' }));
  expect(screen.getByText('FAILED · error_max_turns')).toBeInTheDocument();
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
  'keeps running and asking after a result until the session %s',
  async (_, event) => {
    await running();
    const working = () => screen.queryByRole('status', { name: 'Working' });
    const stop = () => screen.queryByRole('button', { name: '[ STOP ]' });
    act(() => emit({ type: 'done', ok: true, result: 'ok' }));
    expect(working()).toBeInTheDocument();
    expect(stop()).toBeInTheDocument();
    act(() => emit({ type: 'state', state: 'running' }));
    expect(working()).toBeInTheDocument();
    expect(agent.listThreads).toHaveBeenCalledTimes(1);

    act(() => permission('r1'));
    act(() => permission('r2', 'Read', { file_path: '/x' }));
    act(() => permission('r3', 'Grep', { pattern: 'y' }));
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
    expect(working()).toBeNull();
    expect(stop()).toBeNull();
    expect(agent.listThreads).toHaveBeenCalledTimes(2);
  },
);

it('keeps a running thread running when a message queued into it is rejected', async () => {
  const user = await running();
  agent.send.mockRejectedValueOnce(new Error('model unavailable'));
  await sendPrompt(user, 'also this');
  expect(await screen.findByText('model unavailable')).toBeInTheDocument();
  expect(screen.queryByText('also this')).toBeNull();
  expect(screen.getByRole('status', { name: 'Working' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '[ STOP ]' })).toBeInTheDocument();
});

it('stops the turn without ending the session, showing a failed stop as an error', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await running();
  const runId = lastRunId();
  await user.type(screen.getByPlaceholderText('Ask the agent…'), 'queued');
  await user.click(screen.getByRole('button', { name: '[ SEND ]' }));
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

  agent.interrupt.mockRejectedValue(new Error('session closing'));
  await user.click(screen.getByRole('button', { name: '[ STOP ]' }));
  expect(await screen.findByText('session closing')).toHaveClass('text-alert');
});

it('lists open projects side by side, collapsing them and starting threads in each', async () => {
  agent.listThreads.mockImplementation(async (cwd: string) =>
    cwd === '/proj'
      ? list
      : [{ id: 'o', title: 'Other', createdAt: now, updatedAt: now }],
  );
  const user = await open();
  await openAnother(user, '/other');
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
    'Other',
  );
  expect(sidebarTitles()).toEqual(['Newest', 'Older', 'Other']);

  await user.click(screen.getByRole('button', { name: 'proj' }));
  expect(sidebarTitles()).toEqual(['Other']);
  await user.keyboard('{Control>}{Tab}{/Control}');
  expect(heading()).toBe('Other');

  await user.click(screen.getByRole('button', { name: 'New in proj' }));
  expect(heading()).toBe('New thread');
  expect(sidebarTitles()).toEqual(['New thread', 'Newest', 'Older', 'Other']);
  await sendPrompt(user, 'hi');
  expect(agent.send).toHaveBeenLastCalledWith(
    expect.any(String),
    'hi',
    [],
    '/proj',
    undefined,
    { model: 'opus' },
    'auto',
    expect.any(String),
  );
});

it('reopens the projects left open, collapsed as they were, across restarts', async () => {
  agent.listThreads.mockImplementation(async (cwd: string) =>
    cwd === '/proj'
      ? list
      : [{ id: 'o', title: 'Other', createdAt: now, updatedAt: now }],
  );
  const user = await open();
  await openAnother(user, '/other');
  await screen.findByRole('button', { name: /Other/ });
  await user.click(screen.getByRole('button', { name: 'other' }));

  await restart();
  expect(agent.pickWorkspace).toHaveBeenCalledTimes(2);
  expect(sidebarTitles()).toEqual(['Newest', 'Older']);
  expect(screen.getByRole('button', { name: 'other' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

it('opens at most four projects', async () => {
  const user = await open();
  for (const cwd of ['/b', '/c', '/d']) await openAnother(user, cwd);
  await openAnother(user, '/e');
  expect(screen.getByText('Close a project to open another')).toBeVisible();
  expect(agent.listThreads).not.toHaveBeenCalledWith('/e');

  await user.click(screen.getByRole('button', { name: 'Close b' }));
  await openAnother(user, '/e');
  expect(await screen.findByRole('button', { name: 'e' })).toBeVisible();
  expect(
    screen.queryByText('Close a project to open another'),
  ).not.toBeInTheDocument();
});

it('keeps one archive for every project, naming the project under each title', async () => {
  const day = 86_400_000;
  agent.listThreads.mockImplementation(async (cwd: string) => [
    {
      id: cwd,
      title: 'Old',
      createdAt: now - day,
      updatedAt: now - day,
    },
  ]);
  const user = await open();
  await openAnother(user, '/other');
  await screen.findByRole('button', { name: 'other' });
  await user.keyboard('{Control>}n{/Control}');
  await user.click(screen.getByRole('button', { name: '[ ARCHIVED 2 ]' }));
  expect(sidebarTitles()).toEqual([
    'New thread',
    '[ HIDE ARCHIVED ]',
    'Oldproj',
    'Oldother',
  ]);
});

it("closes a project's idle sessions, leaving running ones, and resumes them on reopen", async () => {
  agent.listThreads.mockImplementation(async (cwd: string) =>
    cwd === '/proj'
      ? list
      : [{ id: 'o', title: 'Other', createdAt: now, updatedAt: now }],
  );
  const user = await open();
  await sendPrompt(user, 'first');
  const idleRun = lastRunId();
  await act(async () => finishRun());
  await user.click(screen.getByRole('button', { name: /Older/ }));
  await sendPrompt(user, 'second');
  const busyRun = lastRunId();
  await openAnother(user, '/other');
  await screen.findByRole('button', { name: /Other/ });

  await user.click(screen.getByRole('button', { name: 'Close proj' }));
  expect(sidebarTitles()).toEqual(['Other']);
  expect(heading()).toBe('Other');
  expect(agent.close).toHaveBeenCalledWith(idleRun);
  expect(agent.close).not.toHaveBeenCalledWith(busyRun);

  await openAnother(user, '/proj');
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

it('defaults to auto mode and switches mode from settings', async () => {
  agent.listThreads.mockResolvedValue(list);
  agent.usage.mockResolvedValue(null);
  const user = await open();
  await sendPrompt(user, 'go');
  const runId = lastRunId();
  expect(agent.send.mock.lastCall![6]).toBe('auto');
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  await user.click(screen.getByRole('button', { name: 'Agent' }));
  const modes = screen.getByRole('radiogroup', { name: 'Permission mode' });
  expect(within(modes).getByRole('radio', { name: 'Auto' })).toBeChecked();
  await user.click(within(modes).getByRole('radio', { name: 'Plan' }));
  expect(within(modes).getByRole('radio', { name: 'Plan' })).toBeChecked();
  await user.keyboard('{Escape}');
  expect(localStorage.getItem('mode')).toBe('plan');
  expect(agent.setPermission).toHaveBeenCalledWith(runId, 'plan');
  await sendPrompt(user, 'more');
  expect(agent.send.mock.lastCall![6]).toBe('plan');

  cleanup();
  const again = await restart();
  await sendPrompt(again, 'later');
  expect(agent.send.mock.lastCall![6]).toBe('plan');
});

it('shows a pending question in a box that takes picked options or a skip', async () => {
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
  expect(box).toHaveTextContent('Which workspace?');
  expect(box).toHaveTextContent('01Env varSkip the dialog.');
  expect(box).toHaveTextContent('02Inspector');
  const submit = within(box).getByRole('button', { name: '[ SUBMIT ]' });
  await user.click(within(box).getByRole('radio', { name: /Env var/ }));
  await user.keyboard('{Enter}');
  expect(agent.answerPermission).not.toHaveBeenCalled();
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
  await user.type(otherSuite, 'Playwright{Enter}');
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
  act(() => emit({ type: 'done', ok: true, result: '' }));
  expect(screen.getByRole('group', { name: 'Questions' })).toBe(answered);

  act(() =>
    permission('r2', 'AskUserQuestion', {
      questions: [
        {
          question: 'Which?',
          header: 'Pick',
          options: [{ label: 'A', description: '' }],
        },
      ],
    }),
  );
  await user.click(screen.getByRole('button', { name: '[ SKIP ]' }));
  expect(agent.answerPermission).toHaveBeenLastCalledWith(
    runId,
    'r2',
    false,
    undefined,
  );
});

it('asks to allow or deny a tool call, marking the thread as waiting', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await running();
  const runId = lastRunId();
  const dot = () =>
    row(/Newest/).getByLabelText(/^(attention|running)$/).ariaLabel;
  const wave = () => screen.queryByRole('status', { name: 'Working' });
  expect(dot()).toBe('running');
  act(() => permission('r1', 'Bash', { command: 'rm -rf x\nmore' }));
  expect(dot()).toBe('attention');
  expect(wave()).toBeNull();
  const [card] = permissionCards();
  expect(card).toHaveTextContent('Bash');
  expect(card).toHaveTextContent('rm -rf x');
  expect(card).toHaveTextContent('more');
  await user.click(within(card).getByRole('button', { name: '[ ALLOW ]' }));
  expect(agent.answerPermission).toHaveBeenCalledWith(
    runId,
    'r1',
    true,
    undefined,
  );
  expect(permissionCards()).toHaveLength(0);
  expect(dot()).toBe('running');
  expect(wave()).toBeInTheDocument();

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

it('keeps a pending permission when another thread finishes', async () => {
  agent.listThreads.mockResolvedValue(list);
  const user = await open();
  await sendPrompt(user, 'first');
  const runB = lastRunId();
  act(() => permission('r1'));
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

it('opens settings to switch theme and read usage and hotkeys, closing from X, Escape or outside', async () => {
  agent.usage.mockResolvedValue([
    { label: 'Session', utilization: 42.4, resetsAt: null },
  ]);
  const user = await open();
  const cog = screen.getByRole('button', { name: 'Settings' });
  const settings = () => screen.queryByRole('dialog', { name: 'Settings' });

  await user.click(cog);
  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  expect(screen.queryByTitle('Update available')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Usage' }));
  expect(screen.getByText('Session')).toBeInTheDocument();
  expect(screen.getByText('42%')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Hotkeys' }));
  expect(screen.getByText('Toggle backlog')).toBeInTheDocument();
  expect(screen.getByText('Ctrl + T')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Close' }));
  expect(settings()).toBeNull();
  expect(cog).toHaveFocus();

  await user.click(cog);
  expect(
    screen.getByRole('heading', { name: 'Appearance' }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: 'light' }));
  expect(screen.getByRole('radio', { name: 'light' })).toBeChecked();
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(localStorage.getItem('theme')).toBe('light');
  await user.keyboard('{Escape}');
  expect(settings()).toBeNull();

  await user.click(cog);
  await user.click(settings()!.parentElement!);
  expect(settings()).toBeNull();
});

it('shows the last usage seen when none was fetched this run', async () => {
  agent.usage.mockResolvedValue(null);
  let user = await open();
  const showUsage = async () => {
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Usage' }));
  };
  await showUsage();
  expect(await screen.findByText('No plan limits')).toBeInTheDocument();

  cleanup();
  localStorage.setItem(
    'usage',
    JSON.stringify([{ label: 'Week', utilization: 61, resetsAt: null }]),
  );
  user = await restart();
  await showUsage();
  expect(await screen.findByText('61%')).toBeInTheDocument();
});

it('offers an update from settings, reporting failed installs so they can be retried', async () => {
  agent.usage.mockResolvedValue(null);
  update.check.mockResolvedValue({
    commits: ['Settings page', 'Faster entries'],
    error: 'Update failed, see /tmp/zephyr-update.log',
  });
  update.install.mockResolvedValueOnce('fatal: Not possible to fast-forward');
  const user = await open();
  expect(await screen.findByTitle('Update available')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  await user.click(screen.getByRole('button', { name: 'Update' }));
  expect(screen.getByText('Faster entries')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Update failed');

  const install = () =>
    user.click(
      screen.getByRole('button', { name: /UPDATE AND RESTART|UPDATING/ }),
    );
  await install();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Not possible to fast-forward',
  );
  expect(
    screen.getByRole('button', { name: '[ UPDATE AND RESTART ]' }),
  ).toBeEnabled();
  await install();
  expect(update.install).toHaveBeenLastCalledWith(expect.any(String));
  expect(screen.getByRole('button', { name: '[ UPDATING ]' })).toBeDisabled();
});

it('cycles threads with Ctrl+Tab and opens a thread, settings or a workspace from the keyboard', async () => {
  agent.listThreads.mockResolvedValue(withOldest);
  agent.usage.mockResolvedValue(null);
  const user = await open();
  await user.click(screen.getByRole('button', { name: /Oldest/ }));
  await sendPrompt(user, 'go');
  await user.click(screen.getByRole('button', { name: /Newest/ }));

  await user.keyboard('{Control>}{Tab}{/Control}');
  expect(heading()).toBe('Oldest');
  await user.keyboard('{Control>}{Tab}{/Control}');
  expect(heading()).toBe('Newest');
  await user.keyboard('{Control>}{Shift>}{Tab}{/Shift}{/Control}');
  expect(heading()).toBe('Oldest');

  await user.click(screen.getByRole('button', { name: 'Settings' }));
  await user.click(screen.getByRole('button', { name: 'Hotkeys' }));
  await user.click(screen.getByRole('radio', { name: 'all' }));
  await user.keyboard('{Escape}');
  await user.keyboard('{Control>}{Shift>}{Tab}{/Shift}{/Control}');
  expect(heading()).toBe('Older');

  await user.keyboard('{Control>}n{/Control}');
  expect(heading()).toBe('New thread');
  await user.keyboard('{Control>},{/Control}');
  expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await user.keyboard('{Escape}');
  await user.keyboard('{Control>}o{/Control}');
  expect(agent.pickWorkspace).toHaveBeenCalledTimes(2);
});

it('shows the project backlog, edits it and follows changes on disk', async () => {
  let change: (cwd: string, entries: BacklogEntry[]) => void = () => undefined;
  backlog.onChange.mockImplementation((l) => {
    change = l;
    return () => undefined;
  });
  const ship = { line: 1, text: 'ship', done: false };
  const old = { line: 0, text: 'old', done: true };
  const later = { line: 2, text: 'later', done: false };
  backlog.watch.mockResolvedValue([ship, old, later]);
  backlog.edit.mockResolvedValue([
    ship,
    old,
    later,
    { line: 3, text: 'docs', done: false },
  ]);
  const user = await open();
  const labels = () =>
    screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'));
  expect(backlog.watch).toHaveBeenCalledWith('/proj');
  await user.click(await screen.findByRole('checkbox', { name: 'ship' }));
  expect(backlog.edit).toHaveBeenCalledWith('/proj', {
    type: 'toggle',
    entry: ship,
  });
  await user.type(screen.getByLabelText('New backlog entry'), 'docs{Enter}');
  expect(backlog.edit).toHaveBeenLastCalledWith('/proj', {
    type: 'add',
    text: 'docs',
  });
  expect(screen.getByLabelText('New backlog entry')).toHaveValue('');
  await screen.findByRole('checkbox', { name: 'docs' });
  expect(labels()).toEqual(['ship', 'later', 'docs']);

  await user.click(screen.getByRole('button', { name: '[ DONE 1 ]' }));
  expect(labels()).toEqual(['ship', 'later', 'docs', 'old']);
  expect(screen.getByRole('checkbox', { name: 'old' })).toBeChecked();
  await user.click(screen.getByRole('button', { name: '[ HIDE DONE ]' }));
  expect(labels()).toEqual(['ship', 'later', 'docs']);

  act(() => change('/other', []));
  expect(screen.getByRole('checkbox', { name: 'docs' })).toBeInTheDocument();
  act(() => change('/proj', [{ line: 0, text: 'ship', done: true }]));
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  expect(screen.getByRole('button', { name: '[ DONE 1 ]' })).toBeVisible();
  act(() => change('/proj', []));
  expect(screen.getByText('EMPTY')).toBeInTheDocument();
});

it('renames an entry inline', async () => {
  const ship = { line: 0, text: 'ship', done: false };
  const { user, edit } = await openWithBacklog([ship]);
  await user.dblClick(screen.getByText('ship'));
  const input = screen.getByRole('textbox', { name: 'Rename ship' });
  expect(input).toHaveValue('ship');
  expect(input).toHaveFocus();
  await user.type(input, ' it{Enter}');
  expect(edit).toHaveBeenLastCalledWith('/proj', {
    type: 'rename',
    entry: ship,
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
  await user.click(screen.getByLabelText('New backlog entry'));
  expect(edit).toHaveBeenLastCalledWith('/proj', {
    type: 'rename',
    entry: ship,
    text: 'ship later',
  });
});

it('toggles the backlog panel from its icon, the separator lines and Ctrl+T', async () => {
  const user = await open();
  const toggle = screen.getByRole('button', { name: 'Hide backlog' });
  expect(toggle.querySelector('svg.lucide')).not.toBeNull();
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(toggle).toHaveAttribute('title', 'Toggle backlog (Ctrl+T)');
  await user.click(toggle);
  expect(toggle).toHaveAccessibleName('Show backlog');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const line = toggle.parentElement!.firstElementChild!;
  await user.click(line);
  expect(toggle).toHaveAccessibleName('Hide backlog');
  fireEvent.pointerDown(line, { clientX: 100, clientY: 100 });
  fireEvent.pointerMove(line, { clientX: 140, clientY: 100 });
  fireEvent.pointerUp(line, { clientX: 140, clientY: 100 });
  fireEvent.click(line, { clientX: 140, clientY: 100, detail: 1 });
  expect(toggle).toHaveAccessibleName('Hide backlog');

  const box = screen.getByPlaceholderText('Ask the agent…');
  await user.click(box);
  await user.keyboard('{Control>}t{/Control}');
  expect(toggle).toHaveAccessibleName('Show backlog');
  expect(box).toHaveValue('');
  await user.keyboard('{Meta>}t{/Meta}');
  expect(toggle).toHaveAccessibleName('Hide backlog');

  cleanup();
  const ua = vi
    .spyOn(navigator, 'userAgent', 'get')
    .mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Electron/40.0.0',
    );
  onTestFinished(() => ua.mockRestore());
  await restart();
  expect(screen.getByRole('button', { name: 'Hide backlog' })).toHaveAttribute(
    'title',
    'Toggle backlog (⌘T)',
  );
});

it('starts with the backlog panel closed when the saved layout collapsed it', async () => {
  localStorage.setItem(
    'react-resizable-panels:backlog',
    JSON.stringify({ main: 100, backlog: 0 }),
  );
  await open();
  expect(screen.getByRole('button', { name: 'Show backlog' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

it('keeps the panel snap animation running for the full duration after a second toggle', async () => {
  await open();
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const toggle = screen.getByRole('button', { name: 'Hide backlog' });
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

it('reorders entries by dragging them within their group', async () => {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((text, line) => ({
    line,
    text,
    done: text === 'd',
  }));
  const { user, edit } = await openWithBacklog([a, b, c, d]);
  await user.click(screen.getByRole('button', { name: '[ DONE 1 ]' }));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    bottom: 20,
    height: 20,
  } as DOMRect);
  const drag = (from: string, to: string, clientY: number) => {
    const dataTransfer = transfer();
    fireEvent.dragStart(entryRow(from), { dataTransfer });
    fireEvent.dragOver(entryRow(to), { dataTransfer, clientY });
    const drop = entryRow(to).getAttribute('data-drop');
    const dragging = entryRow(from).hasAttribute('data-dragging');
    fireEvent.drop(entryRow(to), { dataTransfer, clientY });
    fireEvent.dragEnd(entryRow(from), { dataTransfer });
    return { drop, dragging };
  };
  expect(drag('c', 'a', 5)).toEqual({ drop: 'before', dragging: true });
  expect(edit).toHaveBeenLastCalledWith('/proj', {
    type: 'move',
    entry: c,
    before: a,
  });
  expect(drag('a', 'b', 15)).toEqual({ drop: 'after', dragging: true });
  expect(edit).toHaveBeenLastCalledWith('/proj', {
    type: 'move',
    entry: a,
    before: c,
  });
  drag('a', 'c', 15);
  expect(edit).toHaveBeenLastCalledWith('/proj', {
    type: 'move',
    entry: a,
    before: undefined,
  });
  expect(entryRow('a')).not.toHaveAttribute('data-dragging');
  edit.mockClear();
  expect(drag('a', 'd', 5).drop).toBeNull();
  expect(edit).not.toHaveBeenCalled();
});

it('binds one set of drag end listeners per drag and ends a drag whose entry vanished', async () => {
  await openWithBacklog([
    { line: 0, text: 'ship', done: false },
    { line: 1, text: 'docs', done: false },
  ]);
  const add = vi.spyOn(window, 'addEventListener');
  onTestFinished(() => add.mockRestore());
  const dragEnds = () => add.mock.calls.filter(([type]) => type === 'dragend');
  const dataTransfer = transfer();
  const zone = () => screen.queryByText('[ + NEW THREAD ]');
  fireEvent.dragStart(entryRow('ship'), { dataTransfer });
  fireEvent.dragOver(zone()!, { dataTransfer });
  fireEvent.dragLeave(zone()!, { dataTransfer });
  fireEvent.dragOver(zone()!, { dataTransfer });
  expect(dragEnds()).toHaveLength(1);

  act(() =>
    backlog.onChange.mock.lastCall![0]('/proj', [
      { line: 0, text: 'docs', done: false },
    ]),
  );
  expect(zone()).toBeNull();
  fireEvent.dragStart(entryRow('docs'), { dataTransfer });
  expect(zone()).not.toHaveAttribute('data-over');
  expect(dragEnds()).toHaveLength(2);
});

it('copies an entry dropped on the chat into the composer, ignoring plain text', async () => {
  const { user, edit } = await openWithBacklog([
    { line: 0, text: 'ship', done: false },
  ]);
  const box = screen.getByPlaceholderText('Ask the agent…');
  const target = () =>
    screen.queryByText('[ + ADD TO PROMPT ]')?.parentElement ?? null;
  const text = transfer({ 'text/plain': 'hello' });
  expect(fireEvent.dragOver(box, { dataTransfer: text })).toBe(true);
  expect(fireEvent.drop(box, { dataTransfer: text })).toBe(true);
  expect(box).toHaveValue('');
  expect(target()).toBeNull();

  let dataTransfer = transfer();
  fireEvent.dragStart(entryRow('ship'), { dataTransfer });
  expect(target()).toBeInTheDocument();
  expect(target()).not.toHaveAttribute('data-over');
  fireEvent.dragOver(box, { dataTransfer });
  expect(target()).toHaveAttribute('data-over');
  fireEvent.dragOver(screen.getByText('[ + NEW THREAD ]'), { dataTransfer });
  expect(target()).not.toHaveAttribute('data-over');
  fireEvent.dragOver(box, { dataTransfer });
  expect(fireEvent.drop(box, { dataTransfer })).toBe(false);
  fireEvent.dragEnd(entryRow('ship'), { dataTransfer });
  expect(target()).toBeNull();
  expect(box).toHaveValue('ship');
  expect(box).toHaveFocus();

  await user.clear(box);
  await user.type(box, 'draft');
  box.blur();
  dataTransfer = transfer();
  fireEvent.dragStart(entryRow('ship'), { dataTransfer });
  fireEvent.drop(box, { dataTransfer });
  fireEvent.dragEnd(entryRow('ship'), { dataTransfer });
  expect(box).toHaveValue('draft\nship');
  expect(box).toHaveFocus();
  expect(edit).not.toHaveBeenCalled();
  expect(screen.getByRole('checkbox', { name: 'ship' })).toBeInTheDocument();
});

it('fills the empty draft, or starts a new thread, from an entry dropped on the new thread zone', async () => {
  await openWithBacklog([{ line: 0, text: 'ship', done: false }]);
  const zone = () => screen.queryByText('[ + NEW THREAD ]');
  const box =
    screen.getByPlaceholderText<HTMLTextAreaElement>('Ask the agent…');
  const dropOnZone = () => {
    const dataTransfer = transfer();
    fireEvent.dragStart(entryRow('ship'), { dataTransfer });
    fireEvent.dragOver(zone()!, { dataTransfer });
    expect(zone()).toHaveAttribute('data-over');
    fireEvent.drop(zone()!, { dataTransfer });
    expect(zone()).toBeNull();
  };
  expect(zone()).toBeNull();
  const dataTransfer = transfer();
  fireEvent.dragStart(entryRow('ship'), { dataTransfer });
  expect(zone()).toBeInTheDocument();
  fireEvent.dragEnd(entryRow('ship'), { dataTransfer });
  expect(zone()).toBeNull();

  dropOnZone();
  expect(sidebarTitles()).toEqual(['New thread']);
  expect(box).toHaveValue('ship');
  expect(box).toHaveFocus();
  expect([box.selectionStart, box.selectionEnd]).toEqual([4, 4]);

  dropOnZone();
  expect(sidebarTitles()).toEqual(['New thread', 'New thread']);
  const fresh =
    screen.getByPlaceholderText<HTMLTextAreaElement>('Ask the agent…');
  expect(fresh).toHaveValue('ship');
  expect(fresh).toHaveFocus();
  expect([fresh.selectionStart, fresh.selectionEnd]).toEqual([4, 4]);
});

it('runs a thread on the current branch, or in a new worktree picked before its first message', async () => {
  const tree = '/proj/.zephyr/worktrees/abc';
  agent.branch.mockImplementation(async (cwd: string) =>
    cwd === tree ? 'zephyr/abc' : 'main',
  );
  agent.createWorktree.mockResolvedValue({
    path: tree,
    branch: 'zephyr/abc',
    setup: { command: 'make deps', ok: false, output: 'no make' },
  });
  localStorage.setItem('setup', JSON.stringify({ '/proj': 'make deps' }));
  const user = await open();
  await sendPrompt(user, 'on main');
  expect(agent.send.mock.lastCall![3]).toBe('/proj');
  expect(screen.queryByRole('button', { name: 'main' })).toBeNull();
  expect(screen.getByText('main')).toBeInTheDocument();
  await finish();

  await user.keyboard('{Control>}n{/Control}');
  await user.click(await screen.findByRole('button', { name: 'main' }));
  await user.click(screen.getByRole('menuitemradio', { name: 'New worktree' }));
  expect(screen.queryByRole('menu')).toBeNull();
  await sendPrompt(user, 'isolated');
  expect(agent.createWorktree).toHaveBeenCalledWith(
    '/proj',
    expect.any(String),
    'make deps',
  );
  expect(agent.send.mock.lastCall![3]).toBe(tree);
  expect(await screen.findByText(/Setup failed\s+no make/)).toBeInTheDocument();
  expect(await screen.findByText('zephyr/abc')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'zephyr/abc' })).toBeInTheDocument();

  act(() => emit({ type: 'session', sessionId: 'wt' }));
  agent.listThreads.mockResolvedValue([
    {
      id: 'wt',
      title: 'isolated',
      createdAt: now,
      updatedAt: now,
      worktree: tree,
      branch: 'zephyr/abc',
    },
  ]);
  await finish();
  await sendPrompt(user, 'again');
  expect(agent.createWorktree).toHaveBeenCalledTimes(1);
  expect(agent.send.mock.lastCall!.slice(3, 5)).toEqual([tree, 'wt']);
});

async function pendingWorktree() {
  const tree = '/proj/.zephyr/worktrees/abc';
  let ready!: () => void;
  agent.createWorktree.mockReturnValue(
    new Promise((resolve) => {
      ready = () => resolve({ path: tree, branch: 'zephyr/abc' });
    }),
  );
  const user = await open();
  await user.click(await screen.findByRole('button', { name: 'main' }));
  await user.click(screen.getByRole('menuitemradio', { name: 'New worktree' }));
  await sendPrompt(user, 'first');
  return { user, tree, ready };
}

it('never sends messages stopped while the worktree is still being created, keeping the worktree', async () => {
  const { user, tree, ready } = await pendingWorktree();
  await sendPrompt(user, 'second');
  await user.click(screen.getByRole('button', { name: '[ STOP ]' }));
  expect(screen.queryByText('second')).toBeNull();
  await act(async () => ready());
  expect(agent.send).not.toHaveBeenCalled();
  expect(await screen.findByText('STOPPED')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '[ STOP ]' })).toBeNull();

  await sendPrompt(user, 'again');
  expect(agent.createWorktree).toHaveBeenCalledTimes(1);
  expect(agent.send).toHaveBeenCalledTimes(1);
  expect(agent.send.mock.lastCall![1]).toBe('again');
  expect(agent.send.mock.lastCall![3]).toBe(tree);
});

it('still sends a message queued after a stop that came before the worktree was ready', async () => {
  const { user, ready } = await pendingWorktree();
  await user.click(screen.getByRole('button', { name: '[ STOP ]' }));
  await sendPrompt(user, 'third');
  await act(async () => ready());
  expect(agent.send).toHaveBeenCalledTimes(1);
  expect(agent.send.mock.lastCall![1]).toBe('third');
});

it("keeps a thread's first message waiting on its worktree when another thread is stopped", async () => {
  const { user, ready } = await pendingWorktree();
  await user.click(screen.getByRole('button', { name: 'New in proj' }));
  await sendPrompt(user, 'other');
  await user.click(screen.getByRole('button', { name: '[ STOP ]' }));
  await act(async () => ready());
  expect(agent.send.mock.calls.map((c) => c[1])).toEqual(['other', 'first']);
  await user.click(screen.getByRole('button', { name: /first/ }));
  expect(heading()).toBe('first');
  expect(screen.queryByText('STOPPED')).toBeNull();
});

it('lists worktree sessions with the workspace, loading and deleting them in their worktree', async () => {
  const tree = '/proj/.zephyr/worktrees/x';
  agent.listThreads.mockResolvedValue([
    { ...list[0], worktree: tree, branch: 'zephyr/x' },
    list[1],
  ]);
  const user = await open();
  expect(screen.getByRole('img', { name: 'zephyr/x' })).toBeInTheDocument();
  expect(row(/Newest/).getByLabelText('unmerged')).toBeInTheDocument();
  expect(row(/Older/).getByLabelText('read')).toBeInTheDocument();
  expect(agent.loadThread).toHaveBeenCalledWith('b', tree);
  await remove(user, /Newest/);
  expect(agent.deleteThread).toHaveBeenCalledWith('b', '/proj', tree);
});

it('merges an idle worktree thread from its branch label, retrying after an agent resolves conflicts', async () => {
  const tree = '/proj/.zephyr/worktrees/x';
  agent.branch.mockImplementation(async (cwd: string) =>
    cwd === tree ? 'zephyr/x' : 'main',
  );
  agent.listThreads.mockResolvedValue([
    { ...list[0], worktree: tree, branch: 'zephyr/x' },
    list[1],
  ]);
  agent.mergeWorktree.mockRejectedValueOnce(new Error('CONFLICT (content)'));
  const user = await open();
  await user.click(
    await screen.findByRole('button', { name: 'Merge zephyr/x' }),
  );
  await user.click(screen.getByRole('button', { name: 'Confirm merge' }));
  expect(agent.mergeWorktree).toHaveBeenCalledWith('/proj', tree, 'Newest');
  expect(await screen.findByText('CONFLICT (content)')).toBeInTheDocument();
  expect(sidebarTitles()).toEqual(['Newest', 'Older']);

  await user.click(
    screen.getByRole('button', { name: '[ RESOLVE WITH AGENT ]' }),
  );
  expect(agent.send.mock.lastCall!.slice(1, 5)).toEqual([
    'Merging this worktree into main hit conflicts. Merge main into this branch, resolve the conflicts keeping the intent of both sides, run the tests, and commit the merge.',
    [],
    tree,
    'b',
  ]);
  expect(
    screen.queryByRole('button', { name: '[ RESOLVE WITH AGENT ]' }),
  ).toBeNull();
  await act(async () => {
    emit({ type: 'done', ok: true, result: '' });
    finishRun();
  });
  expect(agent.mergeWorktree).toHaveBeenCalledTimes(2);
  expect(agent.deleteThread).toHaveBeenCalledWith('b', '/proj', tree);
  expect(sidebarTitles()).toEqual(['Older']);
  expect(screen.queryByRole('button', { name: /^Merge/ })).toBeNull();
});

it('keeps the thread opened during a merge once the merge removes its own thread', async () => {
  const tree = '/proj/.zephyr/worktrees/x';
  agent.branch.mockImplementation(async (cwd: string) =>
    cwd === tree ? 'zephyr/x' : 'main',
  );
  agent.listThreads.mockResolvedValue([
    { ...withOldest[0], worktree: tree, branch: 'zephyr/x' },
    ...withOldest.slice(1),
  ]);
  let merged!: () => void;
  agent.mergeWorktree.mockReturnValue(
    new Promise<void>((resolve) => (merged = resolve)),
  );
  const user = await open();
  await user.click(
    await screen.findByRole('button', { name: 'Merge zephyr/x' }),
  );
  await user.click(screen.getByRole('button', { name: 'Confirm merge' }));
  await user.click(screen.getByRole('button', { name: /Oldest/ }));
  await act(async () => merged());
  expect(sidebarTitles()).toEqual(['Older', 'Oldest']);
  expect(heading()).toBe('Oldest');
});

it("suggests the workspace's lockfile install as worktree setup and saves an override per workspace", async () => {
  agent.setupCommand.mockResolvedValue('npm ci');
  const user = await open();
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  await user.click(screen.getByRole('button', { name: 'Workspace' }));
  const field = screen.getByRole('textbox', { name: 'Worktree setup' });
  expect(agent.setupCommand).toHaveBeenCalledWith('/proj');
  await vi.waitFor(() =>
    expect(field).toHaveAttribute('placeholder', 'npm ci'),
  );
  await user.type(field, 'pnpm i');
  expect(JSON.parse(localStorage.getItem('setup')!)).toEqual({
    '/proj': 'pnpm i',
  });
  await user.clear(field);
  expect(JSON.parse(localStorage.getItem('setup')!)).toEqual({});
});

it('opens the workspace terminal from the backlog or Ctrl+`, keeping its shell alive and replaying it on reopen', async () => {
  const dialog = () => screen.queryByRole('dialog', { name: 'Terminal' });
  let shellOutput: (cwd: string, data: string) => void = () => undefined;
  let shellExit: (cwd: string) => void = () => undefined;
  terminal.onData.mockImplementation((fn) => {
    shellOutput = fn;
    return () => undefined;
  });
  terminal.onExit.mockImplementation((fn) => {
    shellExit = fn;
    return () => undefined;
  });
  const user = await open();

  await user.click(screen.getByRole('button', { name: '[ TERMINAL ]' }));
  expect(dialog()).toBeInTheDocument();
  await vi.waitFor(() =>
    expect(terminal.open).toHaveBeenCalledWith('/proj', 80, 24),
  );
  typeInTerminal('pwd\r');
  expect(terminal.write).toHaveBeenCalledWith('/proj', 'pwd\r');
  shellOutput('/other', 'elsewhere');
  shellOutput('/proj', '/proj\r\n');
  expect(screenText).toEqual(['/proj\r\n']);

  fireEvent.keyDown(dialog()!, { key: 't', ctrlKey: true });
  expect(
    screen.getByRole('button', { name: 'Hide backlog' }),
  ).toBeInTheDocument();

  await user.keyboard('{Control>}[Backquote]{/Control}');
  expect(dialog()).toBeNull();
  terminal.open.mockResolvedValueOnce('/proj\r\nwhile hidden\r\n');
  await user.keyboard('{Control>}[Backquote]{/Control}');
  expect(dialog()).toBeInTheDocument();
  await vi.waitFor(() =>
    expect(screenText).toEqual(['/proj\r\n', '/proj\r\nwhile hidden\r\n']),
  );
  expect(terminal.open).toHaveBeenCalledTimes(2);
  await user.click(screen.getByRole('button', { name: '[ CLOSE ]' }));
  expect(dialog()).toBeNull();

  await user.keyboard('{Control>}[Backquote]{/Control}');
  act(() => shellExit('/proj'));
  expect(dialog()).toBeNull();
  await user.keyboard('{Control>}[Backquote]{/Control}');
  await vi.waitFor(() => expect(terminal.open).toHaveBeenCalledTimes(4));

  await user.keyboard('{Control>}[Backquote]{/Control}');
  await user.click(screen.getByRole('button', { name: 'Kill terminal' }));
  expect(terminal.close).toHaveBeenCalledWith('/proj');
  act(() => shellExit('/proj'));
  expect(
    screen.queryByRole('button', { name: 'Kill terminal' }),
  ).not.toBeInTheDocument();
});

it('restyles the terminal on a theme change without reopening its shell, drops it on a workspace switch and kills the shell when its project closes', async () => {
  agent.listThreads.mockImplementation(async (cwd: string) =>
    cwd === '/proj'
      ? list
      : [{ id: 'o', title: 'Other', createdAt: now, updatedAt: now }],
  );
  const theme = document.documentElement.dataset.theme;
  onTestFinished(() => void (document.documentElement.dataset.theme = theme));
  const opened = (cwd: string) =>
    terminal.open.mock.calls.filter(([from]) => from === cwd).length;
  const user = await open();
  await openAnother(user, '/other');
  await user.click(await screen.findByRole('button', { name: /Newest/ }));

  await user.keyboard('{Control>}[Backquote]{/Control}');
  await vi.waitFor(() => expect(opened('/proj')).toBe(1));
  document.documentElement.dataset.theme =
    theme === 'cyber' ? 'light' : 'cyber';
  await vi.waitFor(() => expect(restyled).toBe(1));
  expect(opened('/proj')).toBe(1);
  await user.keyboard('{Control>}[Backquote]{/Control}');

  await user.click(screen.getByRole('button', { name: /Other/ }));
  await user.keyboard('{Control>}[Backquote]{/Control}');
  await vi.waitFor(() => expect(opened('/other')).toBe(1));
  await user.keyboard('{Control>}[Backquote]{/Control}');
  await user.click(screen.getByRole('button', { name: /Newest/ }));
  await user.keyboard('{Control>}[Backquote]{/Control}');
  await vi.waitFor(() => expect(opened('/proj')).toBe(2));
  await user.keyboard('{Control>}[Backquote]{/Control}');

  await user.click(screen.getByRole('button', { name: 'Close proj' }));
  expect(terminal.close).toHaveBeenCalledWith('/proj');
});
