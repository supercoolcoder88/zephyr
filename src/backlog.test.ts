// @vitest-environment node
import { unwatchFile } from 'node:fs';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, expect, it, vi } from 'vitest';
import type { BacklogEntry, BacklogEdit } from './agent-types';

const polled = new Map<string, number>();
const held = new Map<string, Promise<void>>();

vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>();
  return {
    ...fs,
    readFile: async (file: string, ...rest: unknown[]) => {
      await held.get(file);
      return (fs.readFile as (...a: unknown[]) => unknown)(file, ...rest);
    },
  };
});

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return {
    ...fs,
    watchFile: (file: string, ...rest: unknown[]) => {
      polled.set(file, (polled.get(file) ?? 0) + 1);
      return (fs.watchFile as (...a: unknown[]) => unknown)(file, ...rest);
    },
    unwatchFile: (file: string, ...rest: unknown[]) => {
      polled.delete(file);
      return (fs.unwatchFile as (...a: unknown[]) => unknown)(file, ...rest);
    },
  };
});

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

it('parses, toggles, renames and adds entries without touching other lines', () => {
  const [first, nested] = parse(doc);
  expect(parse(doc)).toEqual([
    { line: 2, text: 'write tests', done: false },
    { line: 3, text: 'nested', done: true },
    { line: 4, text: 'ship', done: true },
  ]);
  expect(apply(doc, { type: 'toggle', entry: nested })).toBe(
    doc.replace('[X] nested', '[ ] nested'),
  );
  expect(
    apply(doc, { type: 'rename', entry: nested, text: ' deep \n too ' }),
  ).toBe(doc.replace('[X] nested', '[X] deep too'));
  expect(apply(doc, { type: 'rename', entry: nested, text: '  ' })).toBe(doc);
  expect(apply('', { type: 'add', text: '  a\nb ' })).toBe('- [ ] a b\n');
  expect(apply('notes', { type: 'add', text: 'a' })).toBe('notes\n- [ ] a\n');
  expect(apply('x\n', { type: 'add', text: ' ' })).toBe('x\n');

  const moved = `- [ ] new\n${doc}`;
  expect(apply(moved, { type: 'remove', entry: first })).toBe(
    moved.replace('- [ ] write tests\n', ''),
  );
  const gone = { line: 2, text: 'gone', done: false };
  expect(apply(doc, { type: 'toggle', entry: gone })).toBe(doc);
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

it('moves an entry with its nested lines before another or to the end', () => {
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
  expect(move(b, a)).toBe(
    plan.replace(
      '- [ ] a\n- [ ] b\n  - [ ] b child\n  notes on b\n',
      '- [ ] b\n  - [ ] b child\n  notes on b\n- [ ] a\n',
    ),
  );
});

it('skips moves that change nothing or point at missing entries', () => {
  const gone = { line: 3, text: 'gone', done: false };
  expect(move(b, b)).toBe(plan);
  expect(move(b, child)).toBe(plan);
  expect(move(d)).toBe(plan);
  expect(move(gone, a)).toBe(plan);
  expect(move(a, gone)).toBe(move(a));
  expect(move(a, undefined, '- [ ] a\n')).toBe('- [ ] a\n');
  const nested = '- [ ] a\n  - [ ] kid\n';
  expect(move(parse(nested)[0], undefined, nested)).toBe(nested);
});

it('writes edits to a self-ignoring .zephyr folder in order', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'backlog-'));
  const file = (name: string) =>
    readFile(path.join(cwd, '.zephyr', name), 'utf8');
  expect(await edit(cwd, { type: 'add', text: 'one' })).toEqual([
    { line: 0, text: 'one', done: false },
  ]);
  expect(await file('.gitignore')).toBe('*\n');
  await Promise.all(
    ['a', 'b', 'c'].map((text) => edit(cwd, { type: 'add', text })),
  );
  expect(await file('backlog.md')).toBe(
    '- [ ] one\n- [ ] a\n- [ ] b\n- [ ] c\n',
  );

  const existing = await mkdtemp(path.join(os.tmpdir(), 'backlog-'));
  await mkdir(path.join(existing, '.zephyr'));
  await writeFile(path.join(existing, '.zephyr', 'backlog.md'), '- [ ] one\n');
  await edit(existing, { type: 'add', text: 'two' });
  await expect(
    readFile(path.join(existing, '.zephyr', '.gitignore')),
  ).rejects.toThrow();
});

it('polls only the latest workspace when an earlier watch read resolves last', async () => {
  const [a, b] = await Promise.all(
    [0, 1].map(() => mkdtemp(path.join(os.tmpdir(), 'backlog-'))),
  );
  const [fileA, fileB] = [a, b].map((cwd) =>
    path.join(cwd, '.zephyr', 'backlog.md'),
  );
  const watch = (cwd: string) =>
    handlers.get('backlog:watch')!(
      { sender: { isDestroyed: () => false, send: () => {} } },
      cwd,
    );
  let release!: () => void;
  held.set(fileA, new Promise((resolve) => (release = resolve)));
  const first = watch(a);
  expect(await watch(b)).toEqual([]);
  release();
  expect(await first).toEqual([]);
  expect([...polled]).toEqual([[fileB, 1]]);
  unwatchFile(fileB);
});
