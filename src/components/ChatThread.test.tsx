import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import ChatThread from './ChatThread';

beforeEach(() => {
  Element.prototype.scrollIntoView = () => undefined;
  window.agent = {
    commands: async () => [],
  } as unknown as typeof window.agent;
});

const renderText = (text: string) =>
  render(
    <ChatThread
      thread={{
        id: 't1',
        title: 'Thread',
        cwd: '/proj',
        updatedAt: 0,
        items: [{ type: 'text', text }],
      }}
      running={false}
      justFinished={false}
      onSend={() => undefined}
      onCancel={() => undefined}
      composer={null}
    />,
  ).container;

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
