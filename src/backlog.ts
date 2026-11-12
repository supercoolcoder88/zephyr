import { ipcMain, type WebContents } from 'electron';
import { unwatchFile, watchFile } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BacklogEntry, BacklogEdit } from './agent-types';

// Agents edit this file too, so it stays plain markdown: every edit touches
// only its own line and the rest of the document is kept as written.
const ITEM = /^(\s*[-*+] \[)([ xX])\] (.*?)\r?$/;

const fileOf = (cwd: string) => path.join(cwd, '.zephyr', 'backlog.md');

const read = (cwd: string) =>
  readFile(fileOf(cwd), 'utf8').catch((err) =>
    err.code === 'ENOENT' ? '' : Promise.reject(err),
  );

export const parse = (content: string): BacklogEntry[] =>
  content.split('\n').flatMap((l, line) => {
    const m = ITEM.exec(l);
    return m ? [{ line, text: m[3], done: m[2] !== ' ' }] : [];
  });

// The line may have moved since the renderer read it; fall back to the first item with the same text.
function locate(lines: string[], entry: BacklogEntry) {
  const at = (i: number) => ITEM.exec(lines[i] ?? '')?.[3] === entry.text;
  if (at(entry.line)) return entry.line;
  return lines.findIndex((_, i) => at(i));
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
const indent = (line: string) => /^\s*/.exec(line)![0].length;

// An item and the lines below it indented deeper, up to the first blank or shallower line.
function blockEnd(lines: string[], i: number) {
  let end = i + 1;
  while (lines[end]?.trim() && indent(lines[end]) > indent(lines[i])) end++;
  return end;
}

export function apply(content: string, edit: BacklogEdit) {
  const lines = content.split('\n');
  if (edit.type === 'add') {
    const text = oneLine(edit.text);
    if (!text) return content;
    if (lines.at(-1) === '') lines.pop();
    return [...lines, `- [ ] ${text}`, ''].join('\n');
  }
  const i = locate(lines, edit.entry);
  if (i < 0) return content;
  const m = ITEM.exec(lines[i])!;
  if (edit.type === 'move') {
    const end = blockEnd(lines, i);
    const b = edit.before ? locate(lines, edit.before) : -1;
    const last = lines.findLastIndex((l) => ITEM.test(l));
    if (b >= i && b < end) return content;
    if (b < 0 && last < end) return content;
    const block = lines.splice(i, end - i);
    const at =
      b < 0
        ? blockEnd(lines, last - block.length)
        : b < i
          ? b
          : b - block.length;
    if (at === lines.length) lines.push('');
    lines.splice(at, 0, ...block);
  } else if (edit.type === 'rename') {
    const text = oneLine(edit.text);
    if (!text) return content;
    lines[i] = `${m[1]}${m[2]}] ${text}${lines[i].endsWith('\r') ? '\r' : ''}`;
  } else if (edit.type === 'remove') lines.splice(i, 1);
  else {
    const at = m[1].length;
    lines[i] =
      lines[i].slice(0, at) +
      (m[2] === ' ' ? 'x' : ' ') +
      lines[i].slice(at + 1);
  }
  return lines.join('\n');
}

let watched: { cwd: string; sender: WebContents; content: string } | undefined;
let watchCalls = 0;
// Edits run one at a time so two quick clicks never read the same stale file.
let edits = Promise.resolve();

function unwatch() {
  if (watched) unwatchFile(fileOf(watched.cwd));
  watched = undefined;
}

export function registerBacklogIpc() {
  ipcMain.handle('backlog:watch', async (event, cwd: string) => {
    unwatch();
    const call = ++watchCalls;
    const current = { cwd, sender: event.sender, content: await read(cwd) };
    // A newer call arrived while we read, so it owns the poller.
    if (call !== watchCalls) return parse(current.content);
    watched = current;
    // Polling stat survives the file being created later or replaced by a rename.
    watchFile(fileOf(cwd), { interval: 500 }, async () => {
      const content = await read(cwd).catch(() => current.content);
      if (current.sender.isDestroyed()) return unwatch();
      if (watched !== current || content === current.content) return;
      current.content = content;
      current.sender.send('backlog:change', cwd, parse(content));
    });
    return parse(current.content);
  });

  ipcMain.handle('backlog:edit', (_, cwd: string, edit: BacklogEdit) => {
    const run = edits.then(async () => {
      const before = await read(cwd);
      const after = apply(before, edit);
      if (after !== before) {
        const file = fileOf(cwd);
        // A new .zephyr folder ignores itself; delete its .gitignore to commit it.
        if (await mkdir(path.dirname(file), { recursive: true }))
          await writeFile(path.join(path.dirname(file), '.gitignore'), '*\n');
        await writeFile(`${file}.tmp`, after);
        await rename(`${file}.tmp`, file);
        if (watched?.cwd === cwd) watched.content = after;
      }
      return parse(after);
    });
    edits = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  });
}
