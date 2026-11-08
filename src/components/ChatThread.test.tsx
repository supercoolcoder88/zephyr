import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { beforeEach, expect, it } from 'vitest';
import type { ThreadItem } from '../agent-types';
import ChatThread from './ChatThread';

const css = readFileSync(`${__dirname}/../index.css`, 'utf8');
const rule = (selector: string) => {
  const start = css.indexOf(`  & ${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
};

beforeEach(() => {
  Element.prototype.scrollIntoView = () => undefined;
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
