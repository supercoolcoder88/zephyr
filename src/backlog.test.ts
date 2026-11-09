// @vitest-environment node
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, expect, it, vi } from 'vitest';
import type { BacklogEntry, BacklogEdit } from './agent-types';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
  },
}));

const { apply, parse, registerBacklogIpc } = await import('./backlog');

beforeAll(() => registerBacklogIpc());

const edit = (cwd: string, change: BacklogEdit) =>
  handlers.get('backlog:edit')!({}, cwd, change) as Promise<BacklogEntry[]>;

const doc = `# Plan

- [ ] write tests
  - [X] nested\r
* [x] ship
notes stay
`;

it('parses task lines at any depth and keeps their line numbers', () => {
  expect(parse(doc)).toEqual([
    { line: 2, text: 'write tests', done: false },
    { line: 3, text: 'nested', done: true },
    { line: 4, text: 'ship', done: true },
  ]);
});

it('toggles only the box on the entry line', () => {
  const [, nested] = parse(doc);
  expect(apply(doc, { type: 'toggle', entry: nested })).toBe(
    doc.replace('[X] nested', '[ ] nested'),
  );
});

it('finds a entry that moved since it was read and skips one that is gone', () => {
  const moved = `- [ ] new\n${doc}`;
  const [entry] = parse(doc);
  expect(apply(moved, { type: 'remove', entry })).toBe(
    moved.replace('- [ ] write tests\n', ''),
  );
  expect(
    apply(doc, {
      type: 'toggle',
      entry: { line: 2, text: 'gone', done: false },
    }),
  ).toBe(doc);
});

it('appends a new entry on one line', () => {
  expect(apply('', { type: 'add', text: '  a\nb ' })).toBe('- [ ] a b\n');
  expect(apply('notes', { type: 'add', text: 'a' })).toBe('notes\n- [ ] a\n');
  expect(apply('x\n', { type: 'add', text: ' ' })).toBe('x\n');
});

it('creates a self-ignoring .zephyr folder on the first write', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'backlog-'));
  expect(await edit(cwd, { type: 'add', text: 'one' })).toEqual([
    { line: 0, text: 'one', done: false },
  ]);
  expect(await readFile(path.join(cwd, '.zephyr', '.gitignore'), 'utf8')).toBe(
    '*\n',
  );
});

it('leaves an existing .zephyr folder without a .gitignore alone', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'backlog-'));
  await mkdir(path.join(cwd, '.zephyr'));
  await writeFile(path.join(cwd, '.zephyr', 'backlog.md'), '- [ ] one\n');
  await edit(cwd, { type: 'add', text: 'two' });
  await expect(
    readFile(path.join(cwd, '.zephyr', '.gitignore')),
  ).rejects.toThrow();
});

it('applies quick edits in order without losing any', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'backlog-'));
  await Promise.all(
    ['a', 'b', 'c'].map((text) => edit(cwd, { type: 'add', text })),
  );
  expect(await readFile(path.join(cwd, '.zephyr', 'backlog.md'), 'utf8')).toBe(
    '- [ ] a\n- [ ] b\n- [ ] c\n',
  );
});

const plan = `# Plan

- [ ] a
- [ ] b
  - [ ] b child
  notes on b
- [x] c

## Later
- [ ] d
`;
const [a, b, child, c, d] = parse(plan);
const move = (entry: BacklogEntry, before?: BacklogEntry, content = plan) =>
  apply(content, { type: 'move', entry, before });

it('moves a entry before another, up or down, or to after the last one', () => {
  expect(move(c, a)).toBe(
    plan
      .replace('- [ ] a\n', '- [x] c\n- [ ] a\n')
      .replace('notes on b\n- [x] c\n', 'notes on b\n'),
  );
  expect(move(a, c)).toBe(
    plan.replace('- [ ] a\n', '').replace('- [x] c\n', '- [ ] a\n- [x] c\n'),
  );
  expect(move(a)).toBe(
    plan.replace('- [ ] a\n', '').replace('- [ ] d\n', '- [ ] d\n- [ ] a\n'),
  );
  expect(move(d, undefined, '- [ ] d\n- [ ] e')).toBe('- [ ] e\n- [ ] d\n');
});

it('moves a entry with its nested lines and skips moves that change nothing', () => {
  expect(move(b, a)).toBe(
    plan.replace(
      '- [ ] a\n- [ ] b\n  - [ ] b child\n  notes on b\n',
      '- [ ] b\n  - [ ] b child\n  notes on b\n- [ ] a\n',
    ),
  );
  expect(move(b, b)).toBe(plan);
  expect(move(b, child)).toBe(plan);
  expect(move({ line: 2, text: 'gone', done: false }, a)).toBe(plan);
  expect(move(a, { line: 3, text: 'gone', done: false })).toBe(move(a));
});

it('leaves the last entry block in place when moving it to the end', () => {
  expect(move(d)).toBe(plan);
  expect(move(a, undefined, '- [ ] a\n')).toBe('- [ ] a\n');
  const nested = '- [ ] a\n  - [ ] kid\n';
  expect(move(parse(nested)[0], undefined, nested)).toBe(nested);
});

it('renames only the text of a entry line', () => {
  expect(
    apply(plan, { type: 'rename', entry: child, text: ' kid \n too ' }),
  ).toBe(plan.replace('  - [ ] b child', '  - [ ] kid too'));
  expect(
    apply(doc, { type: 'rename', entry: parse(doc)[1], text: 'deep' }),
  ).toBe(doc.replace('[X] nested', '[X] deep'));
  expect(apply(plan, { type: 'rename', entry: c, text: '  ' })).toBe(plan);
});
