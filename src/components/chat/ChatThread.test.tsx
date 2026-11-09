import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState, type ComponentProps } from 'react';
import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import type { PermissionRequest, ThreadItem } from '../../agent-types';
import ChatThread from './ChatThread';

const css = readFileSync(`${__dirname}/../../index.css`, 'utf8');
const rule = (selector: string) => {
  const start = css.indexOf(`  & ${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
};

beforeEach(() => {
  Element.prototype.scrollIntoView = () => undefined;
  Range.prototype.getBoundingClientRect = () => new DOMRect(100, 200, 50, 16);
  document.getSelection()?.removeAllRanges();
  window.agent = {
    catalog: async () => ({ commands: [], models: [] }),
    paths: async () => ({}),
    onCatalogChange: () => () => undefined,
  } as unknown as typeof window.agent;
});

// Owns the draft the way App does, since ChatThread shows whatever prompt it is given.
function Drafted(props: ComponentProps<typeof ChatThread>) {
  const [prompt, setPrompt] = useState(props.thread.prompt);
  return (
    <ChatThread
      {...props}
      thread={{ ...props.thread, prompt }}
      onPrompt={(text) => {
        setPrompt(text);
        props.onPrompt(text);
      }}
    />
  );
}

const view = (
  items: ThreadItem[],
  running = false,
  permissions?: PermissionRequest[],
) => (
  <Drafted
    thread={{
      id: 't1',
      title: 'Thread',
      cwd: '/proj',
      createdAt: 0,
      updatedAt: 0,
      items,
      permissions,
    }}
    running={running}
    justFinished={false}
    onSend={() => undefined}
    onCancel={() => undefined}
    onPrompt={() => undefined}
    onImages={() => undefined}
    onAnswer={() => undefined}
    composer={{ current: null }}
  />
);

const renderItems = (items: ThreadItem[], running = false) =>
  render(view(items, running)).container;

const renderText = (text: string) => renderItems([{ type: 'text', text }]);

it('keeps single line breaks in agent output', () => {
  const p = renderText('Teal\nChips').querySelector('.markdown p')!;
  expect(p.querySelector('br')).not.toBeNull();
  expect(p).toHaveTextContent('Teal Chips');
});

it('highlights fenced code blocks with a language', () => {
  const container = renderText('```ts\nconst x = 1;\n```');
  const code = container.querySelector('pre > code')!;
  expect(code).toHaveClass('hljs', 'language-ts');
  expect(code.querySelector('.hljs-keyword')).toHaveTextContent('const');
});

it('leaves fenced code blocks without a language plain', () => {
  const container = renderText('```\nconst x = 1;\n```');
  const code = container.querySelector('pre > code')!;
  expect(code).toHaveTextContent('const x = 1;');
  expect(code.querySelector('.hljs-keyword')).toBeNull();
});

it('renders fenced code blocks with an unknown language', () => {
  const container = renderText('```notalang\nfoo bar\n```');
  expect(container.querySelector('pre > code')).toHaveTextContent('foo bar');
});

it('still renders plain markdown and external links', () => {
  renderText('Hello **world**, see [docs](https://example.com).');
  expect(screen.getByText('world')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute(
    'target',
    '_blank',
  );
});

it('bleeds top-level code blocks across the rule to the column edges', () => {
  const container = renderText('```ts\nconst x = 1;\n```');
  expect(container.querySelector('.markdown > pre')).not.toBeNull();
  expect(rule('> pre')).toMatch(/margin-left: -13px/);
  expect(rule('> pre')).toMatch(/border-left-color: inherit/);
  expect(rule('pre')).toMatch(/overflow-x: auto/);
});

it('stretches tables to the column width inside a horizontal scroller', () => {
  const container = renderText('| a | b |\n|---|---|\n| 1 | 2 |');
  expect(container.querySelector('table')!.parentElement).toHaveClass(
    'overflow-x-auto',
  );
  expect(rule('table')).toMatch(/width: 100%/);
  expect(rule('table')).not.toMatch(/display: block/);
});

it('indents every agent line behind the same 1px rule as the user marker', () => {
  renderItems(
    [
      { type: 'user', text: 'hi' },
      { type: 'text', text: 'reply' },
      { type: 'tool', id: 'tu', name: 'Bash', input: { command: 'ls' } },
      { type: 'error', message: 'boom' },
      { type: 'done', ok: false, result: 'nope' },
    ],
    true,
  );
  expect(screen.getByText('hi').closest('.border')).toHaveClass('px-3');
  for (const line of [
    screen.getByText('reply').closest('.markdown'),
    screen.getByText('bash').parentElement,
    screen.getByText('boom'),
    screen.getByText(/FAILED/),
  ])
    expect(line).toHaveClass('border-l', 'pl-3');
});

it('gives only the streaming text a cyan rule', () => {
  renderItems(
    [
      { type: 'user', text: 'hi' },
      { type: 'text', text: 'old' },
      { type: 'tool', id: 'tu', name: 'Agent', input: { description: 'sub' } },
      { type: 'text', text: 'new' },
    ],
    true,
  );
  expect(screen.getByText('old').closest('.markdown')).toHaveClass(
    'border-line',
  );
  expect(screen.getByText('new').closest('.markdown')).toHaveClass(
    'border-cyan',
  );
});

const renderQuote = (prompt = '') => {
  const onPrompt = vi.fn();
  const composer = createRef<HTMLTextAreaElement>();
  render(
    <Drafted
      thread={{
        id: 't1',
        title: 'Thread',
        cwd: '/proj',
        createdAt: 0,
        updatedAt: 0,
        prompt,
        items: [
          { type: 'user', text: 'first ask\n\nsecond ask' },
          { type: 'text', text: 'first line' },
        ],
      }}
      running={false}
      justFinished={false}
      onSend={() => undefined}
      onCancel={() => undefined}
      onPrompt={onPrompt}
      onImages={() => undefined}
      onAnswer={() => undefined}
      composer={composer}
    />,
  );
  return { onPrompt, composer };
};

const select = (from: Node, to = from) => {
  document.getSelection()!.setBaseAndExtent(from, 0, to, to.childNodes.length);
  fireEvent.mouseUp(from);
};

const copyButton = () =>
  screen.queryByRole('button', { name: '[ COPY TO CHAT ]' });

it('offers to copy a transcript selection to chat', () => {
  renderQuote();
  select(screen.getByText('first line'));
  expect(copyButton()).toBeInTheDocument();
});

it('ignores collapsed and whitespace-only selections', () => {
  renderQuote();
  const line = screen.getByText('first line');
  document.getSelection()!.collapse(line.firstChild!, 2);
  fireEvent.mouseUp(line);
  expect(copyButton()).toBeNull();

  const blank = document.createTextNode('   ');
  line.append(blank);
  document.getSelection()!.setBaseAndExtent(blank, 0, blank, 3);
  fireEvent.mouseUp(line);
  expect(copyButton()).toBeNull();
});

it('ignores selections outside the transcript', async () => {
  renderQuote();
  select(screen.getByRole('heading', { name: 'Thread' }));
  expect(copyButton()).toBeNull();

  const box = screen.getByRole<HTMLTextAreaElement>('combobox');
  await userEvent.type(box, 'draft text');
  box.setSelectionRange(0, 5);
  fireEvent.mouseUp(box);
  expect(copyButton()).toBeNull();
});

it('quotes the selection into an empty composer and focuses it', async () => {
  const { onPrompt, composer } = renderQuote();
  select(screen.getByText(/first ask/));
  await userEvent.click(copyButton()!);
  const box = screen.getByRole<HTMLTextAreaElement>('combobox');
  expect(box).toHaveValue('> first ask\n>\n> second ask\n\n');
  expect(onPrompt).toHaveBeenLastCalledWith('> first ask\n>\n> second ask\n\n');
  expect(composer.current).toHaveFocus();
  expect(box.selectionStart).toBe(box.value.length);
  expect(copyButton()).toBeNull();
  expect(document.getSelection()!.isCollapsed).toBe(true);
});

it('appends the quote after an existing draft', async () => {
  const { onPrompt } = renderQuote('look at this  \n');
  select(screen.getByText('first line'));
  await userEvent.click(copyButton()!);
  expect(screen.getByRole('combobox')).toHaveValue(
    'look at this\n\n> first line\n\n',
  );
  expect(onPrompt).toHaveBeenLastCalledWith('look at this\n\n> first line\n\n');
});

it('shows a prompt set from outside without remounting', () => {
  const thread = {
    id: 't1',
    title: 'Thread',
    cwd: '/proj',
    createdAt: 0,
    updatedAt: 0,
  };
  const props = {
    running: false,
    justFinished: false,
    onSend: () => undefined,
    onCancel: () => undefined,
    onPrompt: () => undefined,
    onImages: () => undefined,
    onAnswer: () => undefined,
    composer: { current: null },
  };
  const { rerender } = render(<ChatThread thread={thread} {...props} />);
  const box = screen.getByRole('combobox');
  rerender(<ChatThread thread={{ ...thread, prompt: 'ship' }} {...props} />);
  expect(screen.getByRole('combobox')).toBe(box);
  expect(box).toHaveValue('ship');
  rerender(<ChatThread thread={thread} {...props} />);
  expect(box).toHaveValue('');
});

it('hides the copy button when the selection clears or the transcript scrolls', () => {
  renderQuote();
  const line = screen.getByText('first line');
  select(line);
  document.getSelection()!.removeAllRanges();
  fireEvent(document, new Event('selectionchange'));
  expect(copyButton()).toBeNull();

  select(line);
  expect(copyButton()).toBeInTheDocument();
  fireEvent.scroll(line.closest('.overflow-y-auto')!);
  expect(copyButton()).toBeNull();
});

it('offers stop and queueing while running', async () => {
  const onSend = vi.fn();
  const onCancel = vi.fn();
  render(
    <Drafted
      thread={{
        id: 't1',
        title: 'Thread',
        cwd: '/proj',
        createdAt: 0,
        updatedAt: 0,
        items: [],
      }}
      running
      justFinished={false}
      onSend={onSend}
      onCancel={onCancel}
      onPrompt={() => undefined}
      onImages={() => undefined}
      onAnswer={() => undefined}
      composer={{ current: null }}
    />,
  );
  const send = screen.getByRole('button', { name: '[ SEND ]' });
  const stop = screen.getByRole('button', { name: '[ STOP ]' });
  expect(send).toBeDisabled();
  expect(send).toHaveClass('chamfer');
  expect(stop).not.toHaveClass('chamfer');
  await userEvent.type(screen.getByRole('combobox'), 'more info{Enter}');
  expect(onSend).toHaveBeenCalledWith('more info', [], { model: 'opus' });
  await userEvent.type(screen.getByRole('combobox'), 'again');
  await userEvent.click(send);
  expect(onSend).toHaveBeenLastCalledWith('again', [], { model: 'opus' });
  await userEvent.click(stop);
  expect(onCancel).toHaveBeenCalled();
});

it('scrolls a new permission card into view when pinned to the bottom', () => {
  const items: ThreadItem[] = [{ type: 'user', text: 'go' }];
  const { container, rerender } = render(view(items, true));
  const scroller = container.querySelector<HTMLElement>('.overflow-y-auto')!;
  Object.defineProperty(scroller, 'scrollHeight', { value: 500 });
  rerender(
    view(items, true, [
      { id: 'r1', toolUseId: 'tr1', tool: 'Bash', input: { command: 'ls' } },
    ]),
  );
  expect(
    screen.getByRole('group', { name: 'Permission request' }),
  ).toBeTruthy();
  expect(scroller.scrollTop).toBe(500);
});

it('steps through sent messages with the arrow keys and restores the draft', async () => {
  const user = userEvent.setup();
  render(
    view([
      { type: 'user', text: 'first' },
      { type: 'text', text: 'reply' },
      { type: 'user', text: 'second\nline' },
    ]),
  );
  const box = screen.getByRole<HTMLTextAreaElement>('combobox');
  await user.type(box, 'draft');
  await user.keyboard('{Home}{ArrowUp}');
  expect(box).toHaveValue('second\nline');
  box.setSelectionRange(0, 0);
  await user.keyboard('{ArrowUp}');
  expect(box).toHaveValue('first');
  await user.keyboard('{ArrowUp}');
  expect(box).toHaveValue('first');
  await user.keyboard('{ArrowDown}');
  expect(box).toHaveValue('second\nline');
  await user.keyboard('{ArrowDown}');
  expect(box).toHaveValue('draft');
});

it('only recalls from the first line of a multi-line draft', async () => {
  const user = userEvent.setup();
  render(view([{ type: 'user', text: 'old' }]));
  const box = screen.getByRole<HTMLTextAreaElement>('combobox');
  await user.type(box, 'a{Shift>}{Enter}{/Shift}b');
  await user.keyboard('{ArrowUp}');
  expect(box).toHaveValue('a\nb');
});
