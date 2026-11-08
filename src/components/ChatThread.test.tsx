import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ThreadItem } from '../agent-types';
import ChatThread from './ChatThread';

const css = readFileSync(`${__dirname}/../index.css`, 'utf8');
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
  } as unknown as typeof window.agent;
});

const renderItems = (items: ThreadItem[], running = false) =>
  render(
    <ChatThread
      thread={{ id: 't1', title: 'Thread', cwd: '/proj', updatedAt: 0, items }}
      running={running}
      justFinished={false}
      onSend={() => undefined}
      onCancel={() => undefined}
      onPrompt={() => undefined}
      composer={null}
    />,
  ).container;

const renderText = (text: string) => renderItems([{ type: 'text', text }]);

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
      { type: 'tool', name: 'Bash', input: { command: 'ls' } },
      { type: 'error', message: 'boom' },
      { type: 'done', ok: false, result: 'nope' },
    ],
    true,
  );
  expect(screen.getByText('hi').parentElement).toHaveClass('border', 'px-3');
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
      { type: 'tool', name: 'Agent', input: { description: 'sub' } },
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
    <ChatThread
      thread={{
        id: 't1',
        title: 'Thread',
        cwd: '/proj',
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

  const box = screen.getByRole<HTMLTextAreaElement>('textbox');
  await userEvent.type(box, 'draft text');
  box.setSelectionRange(0, 5);
  fireEvent.mouseUp(box);
  expect(copyButton()).toBeNull();
});

it('quotes the selection into an empty composer and focuses it', async () => {
  const { onPrompt, composer } = renderQuote();
  select(screen.getByText(/first ask/));
  await userEvent.click(copyButton()!);
  const box = screen.getByRole<HTMLTextAreaElement>('textbox');
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
  expect(screen.getByRole('textbox')).toHaveValue(
    'look at this\n\n> first line\n\n',
  );
  expect(onPrompt).toHaveBeenLastCalledWith('look at this\n\n> first line\n\n');
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
