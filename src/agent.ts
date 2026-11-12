import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type WebContents,
} from 'electron';
import { execFile } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import {
  cp,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  Options,
  Query,
  SDKAssistantMessage,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentEvent,
  Effort,
  Image,
  Model,
  ModelChoice,
  Output,
  Permission,
  SlashCommand,
  ThreadItem,
  UsageWindow,
} from './agent-types';

// The SDK is ESM-only and spawns a native Claude Code binary, so it stays
// external to the Vite bundle and is loaded lazily on first use.
const loadSdk = () => import('@anthropic-ai/claude-agent-sdk');

const git = (cwd: string, ...args: string[]) =>
  promisify(execFile)('git', ['-C', cwd, ...args]).then(
    (r) => r.stdout.trim(),
    (err) => {
      throw new Error(
        `${err.stdout ?? ''}${err.stderr ?? ''}`.trim() || err.message,
      );
    },
  );
const worktrees = (cwd: string) => path.join(cwd, '.zephyr', 'worktrees');

// The install for the first lockfile found; Go and Rust share a global cache, so theirs only prefetch.
const lockfiles = [
  ['pnpm-lock.yaml', 'pnpm install --frozen-lockfile'],
  ['bun.lock', 'bun install --frozen-lockfile'],
  ['bun.lockb', 'bun install --frozen-lockfile'],
  ['yarn.lock', 'yarn install --frozen-lockfile'],
  ['package-lock.json', 'npm ci'],
  ['uv.lock', 'uv sync --frozen'],
  ['poetry.lock', 'poetry install'],
  ['Pipfile.lock', 'pipenv sync'],
  ['Gemfile.lock', 'bundle install'],
  ['composer.lock', 'composer install'],
  ['Cargo.lock', 'cargo fetch'],
  ['go.sum', 'go mod download'],
];
const setupCommand = (cwd: string) =>
  lockfiles.find(([file]) => existsSync(path.join(cwd, file)))?.[1];

// In a packaged app the SDK's own lookup resolves the binary inside app.asar,
// where it can't run; forge.config.mts unpacks it next to the archive.
function packagedClaudeBinary() {
  if (!app.isPackaged) return undefined;
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  return path.join(
    process.resourcesPath,
    'app.asar.unpacked/node_modules/@anthropic-ai',
    `claude-agent-sdk-${process.platform}-${process.arch}`,
    exe,
  );
}

function options(cwd: string): Options {
  return {
    pathToClaudeCodeExecutable: packagedClaudeBinary(),
    cwd,
    tools: { type: 'preset', preset: 'claude_code' },
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    settingSources: ['user', 'project', 'local'],
    skills: 'all',
    permissionMode: 'default',
    // Lets a session switch to bypassPermissions later.
    allowDangerouslySkipPermissions: true,
    extraArgs: { 'replay-user-messages': null },
  };
}

const IDLE_MS = 10 * 60_000;
const MAX_SESSIONS = 6;

type Answer = (allow: boolean, answers?: Record<string, string>) => void;

// One long-lived query per thread, keyed by a renderer-chosen run id.
const sessions = new Map<
  string,
  {
    query: Query;
    push(message: SDKUserMessage): void;
    interrupt(): Promise<unknown>;
    close(): void;
    model: string;
    effort?: Effort;
    permission: Permission;
    setPermission(permission: Permission): Promise<void>;
    answers: Map<string, Answer>;
    idle: boolean;
    lastUsed: number;
    busy(): void;
  }
>();

function send(target: WebContents, runId: string, event: AgentEvent) {
  if (!target.isDestroyed()) target.send('agent:event', runId, event);
}

type AssistantContent = SDKAssistantMessage['message']['content'];

function blockEvents(content: AssistantContent) {
  return content.flatMap((block): Output[] =>
    block.type === 'text'
      ? [{ type: 'text', text: block.text }]
      : block.type === 'tool_use'
        ? [{ type: 'tool', id: block.id, name: block.name, input: block.input }]
        : [],
  );
}

function forward(target: WebContents, runId: string, message: SDKMessage) {
  switch (message.type) {
    case 'system':
      if (message.subtype === 'init') {
        send(target, runId, { type: 'session', sessionId: message.session_id });
      } else if (message.subtype === 'session_state_changed') {
        send(target, runId, { type: 'state', state: message.state });
      } else if (
        message.subtype === 'task_started' &&
        message.task_type === 'local_agent' &&
        message.tool_use_id
      ) {
        send(target, runId, {
          type: 'subthread',
          id: message.tool_use_id,
          title: message.description,
        });
      } else if (
        message.subtype === 'task_notification' &&
        message.tool_use_id
      ) {
        send(target, runId, {
          type: 'subthread-end',
          id: message.tool_use_id,
          ok: message.status === 'completed',
        });
      }
      break;
    case 'assistant': {
      const id = message.parent_tool_use_id;
      for (const output of blockEvents(message.message.content)) {
        send(
          target,
          runId,
          id ? { type: 'subthread-output', id, output } : output,
        );
      }
      break;
    }
    case 'user': {
      // Replays land where the CLI consumed the message, including mid-turn folds.
      if (
        'isReplay' in message &&
        message.isReplay &&
        !message.parent_tool_use_id
      )
        send(target, runId, { type: 'picked', ids: [message.uuid] });
      const block = Array.isArray(message.message?.content)
        ? message.message.content[0]
        : undefined;
      const result = message.tool_use_result as
        | { answers?: Record<string, string> }
        | undefined;
      if (block?.type === 'tool_result' && result?.answers)
        send(target, runId, {
          type: 'answers',
          id: block.tool_use_id,
          answers: result.answers,
        });
      break;
    }
    case 'result':
      send(target, runId, {
        type: 'done',
        ok: message.subtype === 'success' && !message.is_error,
        result:
          message.subtype === 'success' ? message.result : message.subtype,
      });
      break;
  }
}

// Saved sessions keep answers only as the text the model read: "Q1"="A1", "Q2"="A2". ...
function storedAnswers(input: unknown, text: string) {
  const qs = (input as { questions: { question: string }[] }).questions;
  const at = (q: string) => {
    const i = text.indexOf(`"${q}"="`);
    return i < 0 ? i : i + q.length + 4;
  };
  return Object.fromEntries(
    qs.flatMap(({ question }, k) => {
      const start = at(question);
      const next =
        qs[k + 1] && text.indexOf(`", "${qs[k + 1].question}"="`, start);
      const end = next && next > 0 ? next : text.lastIndexOf('". ');
      return start < 0 || end < start
        ? []
        : [[question, text.slice(start, end)]];
    }),
  );
}

// Saved slash commands are tag markup; subagent hand-backs and local command output aren't the user's words.
function shownText(text: string) {
  const name = /<command-name>(.*?)<\/command-name>/.exec(text)?.[1];
  if (name)
    return `${name} ${/<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1] ?? ''}`.trim();
  return /^<(task-notification|agent-message|local-command-[a-z]+)[\s>]/.test(
    text,
  )
    ? []
    : text;
}

const watchedSkills = new Set<string>();

const notifyCatalog = (cwd: string) => {
  for (const w of BrowserWindow.getAllWindows())
    w.webContents.send('agent:catalog-change', cwd);
};

function watchCatalogRoot(root: string, onChange: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 500);
  };
  const watching = new Set<string>();
  const attach = () => {
    for (const name of ['skills', 'commands']) {
      if (watching.has(name)) continue;
      try {
        watch(path.join(root, name), { recursive: true }, changed);
        watching.add(name);
      } catch {}
    }
  };
  attach();
  // A skills or commands folder created later gets watched once it appears.
  try {
    watch(root, (_, file) => {
      if (file !== 'skills' && file !== 'commands') return;
      attach();
      changed();
    });
  } catch {}
}

// Tells renderers to refetch cwd's catalog when a user or project skill or command changes on disk.
function watchSkills(cwd: string) {
  if (watchedSkills.has(cwd)) return;
  // The user dir is shared, so only the first workspace sets it up.
  if (watchedSkills.size === 0)
    watchCatalogRoot(userDir(), () => watchedSkills.forEach(notifyCatalog));
  watchedSkills.add(cwd);
  watchCatalogRoot(path.join(cwd, '.claude'), () => notifyCatalog(cwd));
}

const userDir = () =>
  process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude');

const frontmatter = (text: string): Record<string, string | undefined> =>
  Object.fromEntries(
    [
      ...(/^---\r?\n([\s\S]*?)\r?\n---/
        .exec(text)?.[1]
        .matchAll(/^([\w-]+):(.*(?:\r?\n[ \t]+.*)*)/gm) ?? []),
    ].map(([, key, value]) => [
      key,
      value
        .replace(/^\s*[>|][-+]?/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^(['"])(.*)\1$/, '$2'),
    ]),
  );

// Same layout Claude Code reads: skills/<name>/SKILL.md and commands/**/*.md, where subfolders namespace with ':'.
async function diskCommands(cwd: string) {
  const found: SlashCommand[] = [];
  const add = async (file: string, fallback: string) => {
    const text = await readFile(file, 'utf8').catch(() => '');
    if (!text) return;
    const meta = frontmatter(text);
    found.push({
      name: meta.name || fallback,
      description:
        meta.description ??
        text
          .replace(/^---[\s\S]*?\n---/, '')
          .trim()
          .split('\n')[0],
      argumentHint: meta['argument-hint'] ?? '',
    });
  };
  for (const root of [userDir(), path.join(cwd, '.claude')]) {
    const skills = path.join(root, 'skills');
    const commands = path.join(root, 'commands');
    await Promise.all([
      ...(await readdir(skills).catch(() => [])).map((d) =>
        add(path.join(skills, d, 'SKILL.md'), d),
      ),
      ...(await readdir(commands, { recursive: true }).catch(() => []))
        .filter((f) => f.endsWith('.md'))
        .map((f) =>
          add(path.join(commands, f), f.slice(0, -3).split(path.sep).join(':')),
        ),
    ]);
  }
  return found;
}

// Built-in commands, plugin skills and models only come from a live CLI, so one runs once per app launch.
async function cliCatalog() {
  const { query } = await loadSdk();
  const idle = query({
    prompt: {
      [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }),
    } as AsyncIterable<SDKUserMessage>,
    options: options(os.homedir()),
  });
  try {
    const [commands, models, onDisk] = await Promise.all([
      idle.supportedCommands(),
      idle.supportedModels(),
      diskCommands(os.homedir()),
    ]);
    // getSettings is in the SDK runtime but not its types.
    const { getSettings } = idle as unknown as {
      getSettings(): Promise<{ applied: { effort: Effort | null } }>;
    };
    const families: Model[] = [];
    // Family aliases like 'opus' always resolve to the latest version.
    for (const m of models) {
      if (m.value === 'default' || m.value.includes('-')) continue;
      // Switching the idle session's model reveals the effort Claude Code would pick for it.
      // Models the plan can't switch to (e.g. credit-only) still list, without a default.
      const effort = await idle
        .setModel(m.value)
        .then(() => getSettings.call(idle))
        .then(
          ({ applied }) => applied.effort,
          () => null,
        );
      families.push({
        value: m.value,
        displayName: m.displayName,
        efforts: m.supportedEffortLevels ?? [],
        defaultEffort: effort ?? undefined,
      });
    }
    // Skills on disk are re-read per request, so the CLI's startup copy of them is dropped.
    const disk = new Set(onDisk.map((c) => c.name));
    return {
      commands: commands
        .filter(
          (c) => !c.name.startsWith('_') && (c.builtin || !disk.has(c.name)),
        )
        .map(({ name, description, argumentHint }) => ({
          name,
          description,
          argumentHint,
        })),
      models: families,
    };
  } finally {
    idle.close();
  }
}

let catalog: ReturnType<typeof cliCatalog> | undefined;
// Called at app launch so models are ready before the first composer asks.
export const loadCatalog = () =>
  (catalog ??= cliCatalog().catch((err) => {
    catalog = undefined;
    throw err;
  }));
let usage: UsageWindow[] | null = null;

async function refreshUsage(q: Query) {
  const { rate_limits } =
    await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
      skipBehaviors: true,
    });
  usage = rate_limits
    ? [
        { label: '5 hour', window: rate_limits.five_hour },
        { label: 'Week', window: rate_limits.seven_day },
        { label: 'Week opus', window: rate_limits.seven_day_opus },
        { label: 'Week sonnet', window: rate_limits.seven_day_sonnet },
        ...(rate_limits.model_scoped ?? []).map((w) => ({
          label: `Week ${w.display_name}`,
          window: w,
        })),
      ].flatMap(({ label, window }) =>
        window?.utilization == null
          ? []
          : [
              {
                label,
                utilization: window.utilization,
                resetsAt: window.resets_at,
              },
            ],
      )
    : null;
}

export function registerAgentIpc() {
  ipcMain.handle(
    'agent:send',
    async (
      ipcEvent,
      runId: string,
      prompt: string,
      images: Image[],
      cwd: string,
      resume: string | undefined,
      { model, effort }: ModelChoice,
      permission: Permission,
      uuid: NonNullable<SDKUserMessage['uuid']>,
    ) => {
      const message: SDKUserMessage = {
        type: 'user',
        uuid,
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: images.length
            ? [
                ...images.map((i) => ({
                  type: 'image' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: i.mediaType,
                    data: i.data,
                  },
                })),
                ...(prompt ? [{ type: 'text' as const, text: prompt }] : []),
              ]
            : prompt,
        },
      };
      const { query } = await loadSdk();
      const live = sessions.get(runId);
      if (live) {
        live.busy();
        live.lastUsed = Date.now();
        if (model !== live.model) {
          live.model = model;
          await live.query.setModel(model);
        }
        if (effort !== live.effort) {
          live.effort = effort;
          await live.query.applyFlagSettings({ effortLevel: effort ?? null });
        }
        await live.setPermission(permission);
        return live.push(message);
      }

      if (sessions.size >= MAX_SESSIONS) {
        [...sessions.values()]
          .filter((s) => s.idle)
          .sort((a, b) => a.lastUsed - b.lastUsed)[0]
          ?.close();
      }
      const target = ipcEvent.sender;
      const pending = [message];
      let wake = () => {};
      let closed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const answers = new Map<string, Answer>();
      const q = query({
        prompt: (async function* () {
          while (!closed) {
            const next = pending.shift();
            if (next) yield next;
            else await new Promise<void>((r) => (wake = r));
          }
        })(),
        options: {
          ...options(cwd),
          resume,
          model,
          effort,
          permissionMode: permission,
          canUseTool: (tool, input, { signal, requestId, title, toolUseID }) =>
            new Promise((resolve) => {
              session.busy();
              answers.set(requestId, (allow, given) => {
                if (!answers.delete(requestId)) return;
                send(target, runId, { type: 'permission-end', id: requestId });
                resolve(
                  allow
                    ? {
                        behavior: 'allow',
                        updatedInput: given
                          ? { ...input, answers: given }
                          : input,
                      }
                    : {
                        behavior: 'deny',
                        message: 'The user denied this tool call.',
                      },
                );
              });
              signal.addEventListener('abort', () =>
                answers.get(requestId)?.(false),
              );
              send(target, runId, {
                type: 'permission',
                request: {
                  id: requestId,
                  tool,
                  input,
                  title,
                  toolUseId: toolUseID,
                },
              });
            }),
          env: { ...process.env, CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1' },
        },
      });
      const session = {
        query: q,
        push(m: SDKUserMessage) {
          pending.push(m);
          wake();
        },
        interrupt() {
          pending.length = 0;
          // The SDK accepts cancelQueued but its types don't declare it yet.
          return (
            q.interrupt as (o: { cancelQueued: boolean }) => Promise<unknown>
          ).call(q, { cancelQueued: true });
        },
        close() {
          closed = true;
          if (sessions.get(runId) === session) sessions.delete(runId);
          session.busy();
          wake();
          q.close();
        },
        model,
        effort,
        permission,
        async setPermission(next: Permission) {
          if (next === this.permission) return;
          this.permission = next;
          await q.setPermissionMode(next);
        },
        answers,
        idle: false,
        lastUsed: Date.now(),
        busy() {
          session.idle = false;
          clearTimeout(timer);
        },
      };
      sessions.set(runId, session);
      // A reloaded or crashed renderer keeps its WebContents; did-navigate skips in-page navigations.
      target
        .on('destroyed', session.close)
        .on('did-navigate', session.close)
        .on('render-process-gone', session.close);
      (async () => {
        try {
          for await (const m of q) {
            if (m.type === 'system' && m.subtype === 'session_state_changed') {
              session.busy();
              if (m.state === 'idle' && !answers.size) {
                session.idle = true;
                session.lastUsed = Date.now();
                timer = setTimeout(session.close, IDLE_MS);
              }
            }
            forward(target, runId, m);
            if (m.type === 'result') {
              q.getContextUsage({ detail: 'summary' })
                .then(({ percentage }) =>
                  send(target, runId, { type: 'context', percentage }),
                )
                .catch(() => {});
              refreshUsage(q).catch(() => {});
            }
          }
        } catch (err) {
          if (!closed) {
            send(target, runId, {
              type: 'error',
              message: err instanceof Error ? err.message : String(err),
            });
          }
        } finally {
          session.busy();
          for (const answer of answers.values()) answer(false);
          if (sessions.get(runId) === session) sessions.delete(runId);
          target
            .off('destroyed', session.close)
            .off('did-navigate', session.close)
            .off('render-process-gone', session.close);
          send(target, runId, { type: 'end' });
        }
      })();
    },
  );

  ipcMain.handle('agent:interrupt', async (_, runId: string) => {
    await sessions.get(runId)?.interrupt();
  });

  ipcMain.handle('agent:close', (_, runId: string) => {
    sessions.get(runId)?.close();
  });

  ipcMain.handle(
    'agent:set-permission',
    async (_, runId: string, permission: Permission) => {
      await sessions.get(runId)?.setPermission(permission);
    },
  );

  ipcMain.handle(
    'agent:permission-answer',
    (
      _,
      runId: string,
      id: string,
      allow: boolean,
      answers?: Record<string, string>,
    ) => {
      sessions.get(runId)?.answers.get(id)?.(allow, answers);
    },
  );

  ipcMain.handle('workspace:pick', async (ipcEvent) => {
    // Headless UI review (scripts/ui.mjs) can't click a native dialog.
    if (process.env.ZEPHYR_WORKSPACE) return process.env.ZEPHYR_WORKSPACE;
    const { filePaths } = await dialog.showOpenDialog(
      BrowserWindow.fromWebContents(ipcEvent.sender)!,
      { properties: ['openDirectory'] },
    );
    return filePaths[0];
  });

  ipcMain.handle('git:branch', (_, cwd: string) =>
    git(cwd, 'branch', '--show-current').then(
      (b) => b || 'HEAD',
      () => null,
    ),
  );

  ipcMain.handle('git:setup', (_, cwd: string) => setupCommand(cwd) ?? null);

  ipcMain.handle(
    'git:worktree',
    async (_, cwd: string, name: string, setup?: string) => {
      const dir = worktrees(cwd);
      // Ignores itself so worktrees stay out of git even when .zephyr is committed.
      if (await mkdir(dir, { recursive: true }))
        await writeFile(path.join(dir, '.gitignore'), '*\n');
      const branch = `zephyr/${name}`;
      const tree = path.join(dir, name);
      await git(cwd, 'worktree', 'add', '-b', branch, tree);
      // Ignored env files don't come with a checkout.
      for (const f of await readdir(cwd))
        if (f.startsWith('.env'))
          await cp(path.join(cwd, f), path.join(tree, f), {
            recursive: true,
            force: false,
          });
      // Installs the worktree's own dependencies; a failure is reported, not fatal.
      const command = setup || setupCommand(cwd);
      if (!command) return { path: tree, branch };
      const ran = await promisify(execFile)(
        process.env.SHELL ?? '/bin/sh',
        ['-lc', command],
        { cwd: tree, maxBuffer: 64 * 1024 * 1024 },
      ).then(
        () => ({ ok: true, output: '' }),
        (err) => ({
          ok: false,
          output:
            `${err.stdout ?? ''}${err.stderr ?? ''}`
              .trim()
              .split('\n')
              .slice(-20)
              .join('\n') || err.message,
        }),
      );
      return { path: tree, branch, setup: { command, ...ran } };
    },
  );

  // Squashes the worktree's work, committed or not, onto the workspace's branch, then removes it.
  ipcMain.handle(
    'git:merge',
    async (_, cwd: string, worktree: string, message: string) => {
      if (!worktree.startsWith(worktrees(cwd) + path.sep))
        throw new Error('Only worktrees Zephyr created can be merged');
      const staged = () => git(cwd, 'diff', '--cached', '--name-only');
      if (await staged())
        throw new Error(
          'Commit or unstage the staged changes on your branch first',
        );
      const branch = await git(worktree, 'branch', '--show-current');
      await git(worktree, 'add', '-A');
      if (await git(worktree, 'diff', '--cached', '--name-only'))
        await git(worktree, 'commit', '-m', message);
      await git(cwd, 'merge', '--squash', branch).catch(async (err) => {
        await git(cwd, 'reset', '--merge').catch(() => undefined);
        throw err;
      });
      if (await staged()) await git(cwd, 'commit', '-m', message);
      await git(cwd, 'worktree', 'remove', worktree);
      await git(cwd, 'branch', '-D', branch);
    },
  );

  ipcMain.handle(
    'workspace:paths',
    async (_, cwd: string, candidates: string[]) => {
      const found: Record<string, 'file' | 'folder'> = {};
      await Promise.all(
        candidates.map(async (p) => {
          const full = path.resolve(
            cwd,
            p.replace(/^~(?=$|[\\/])/, os.homedir()),
          );
          const info = await stat(full).catch(() => undefined);
          if (info) found[p] = info.isDirectory() ? 'folder' : 'file';
        }),
      );
      return found;
    },
  );

  ipcMain.handle(
    'workspace:complete',
    async (_, cwd: string, partial: string) => {
      const slash = Math.max(
        partial.lastIndexOf('/'),
        partial.lastIndexOf('\\'),
      );
      const dir = partial.slice(0, slash + 1);
      const prefix = partial.slice(slash + 1).toLowerCase();
      const full = path.resolve(cwd, dir || '.');
      const rel = path.relative(cwd, full);
      if (
        rel === '..' ||
        rel.startsWith(`..${path.sep}`) ||
        path.isAbsolute(rel)
      )
        return [];
      const entries = await readdir(full, { withFileTypes: true }).catch(
        () => [],
      );
      return entries
        .filter(
          (e) =>
            e.name.toLowerCase().startsWith(prefix) &&
            (prefix.startsWith('.') || !e.name.startsWith('.')),
        )
        .map((e) => dir + e.name + (e.isDirectory() ? '/' : ''))
        .sort(
          (a, b) =>
            Number(b.endsWith('/')) - Number(a.endsWith('/')) ||
            a.localeCompare(b),
        )
        .slice(0, 50);
    },
  );

  ipcMain.handle('threads:list', async (_, cwd: string) => {
    const { listSessions } = await loadSdk();
    const sessions = await listSessions({ dir: cwd });
    return sessions
      .sort((a, b) => b.lastModified - a.lastModified)
      .map((s) => ({
        id: s.sessionId,
        title: (s.customTitle || s.summary || s.firstPrompt || 'Untitled')
          .trim()
          .slice(0, 48),
        createdAt: s.createdAt ?? s.lastModified,
        updatedAt: s.lastModified,
        // Sessions of the repo's git worktrees are listed with the workspace.
        ...(s.cwd && s.cwd !== cwd && { worktree: s.cwd, branch: s.gitBranch }),
      }));
  });

  ipcMain.handle('threads:load', async (_, sessionId: string, cwd: string) => {
    const { getSessionMessages } = await loadSdk();
    const items: ThreadItem[] = [];
    // Subagent traffic carries a parent_tool_use_id; only the main conversation is shown.
    for (const m of await getSessionMessages(sessionId, { dir: cwd })) {
      if (m.parent_tool_use_id) continue;
      if (m.type === 'assistant') {
        items.push(
          ...blockEvents((m.message as { content: AssistantContent }).content),
        );
      } else if (m.type === 'user') {
        const { content } = m.message as {
          content:
            | string
            | {
                type: string;
                text?: string;
                tool_use_id?: string;
                content?: unknown;
                source?: {
                  type: string;
                  media_type: Image['mediaType'];
                  data: string;
                };
              }[];
        };
        const blocks = typeof content === 'string' ? [] : content;
        const texts = (
          typeof content === 'string'
            ? [content]
            : blocks.flatMap((b) => (b.type === 'text' ? [b.text!] : []))
        ).flatMap(shownText);
        const images = blocks.flatMap((b): Image[] =>
          b.type === 'image' && b.source?.type === 'base64'
            ? [{ mediaType: b.source.media_type, data: b.source.data }]
            : [],
        );
        for (const b of blocks) {
          if (b.type !== 'tool_result' || typeof b.content !== 'string')
            continue;
          const asked = items.find(
            (i) => i.type === 'tool' && i.id === b.tool_use_id,
          );
          if (asked?.type === 'tool' && asked.name === 'AskUserQuestion')
            asked.input = {
              ...(asked.input as object),
              answers: storedAnswers(asked.input, b.content),
            };
        }
        if (texts.length || images.length) {
          items.push({
            type: 'user',
            text: texts.join('\n'),
            ...(images.length > 0 && { images }),
          });
        }
      }
    }
    return items;
  });

  ipcMain.handle(
    'threads:delete',
    async (_, sessionId: string, cwd: string, worktree?: string) => {
      const { deleteSession } = await loadSdk();
      // Only Zephyr's own worktrees are removed; their branch is kept so no commits are lost.
      if (
        worktree?.startsWith(worktrees(cwd) + path.sep) &&
        existsSync(worktree)
      )
        await git(cwd, 'worktree', 'remove', worktree);
      // Already gone (or a retry after a partial delete) counts as deleted.
      await deleteSession(sessionId, { dir: worktree ?? cwd }).catch(
        (err: unknown) => {
          if (!(err instanceof Error && /not found/i.test(err.message))) {
            throw err;
          }
        },
      );
    },
  );

  ipcMain.handle(
    'agent:catalog',
    async (
      _,
      cwd: string,
    ): Promise<{ commands: SlashCommand[]; models: Model[] }> => {
      watchSkills(cwd);
      const [cli, disk] = await Promise.all([loadCatalog(), diskCommands(cwd)]);
      const byName = new Map(
        [...cli.commands, ...disk].map((c) => [c.name, c]),
      );
      return {
        commands: [...byName.values()].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
        models: cli.models,
      };
    },
  );

  // Refreshed from a thread's own session after each reply, so reading it never starts a CLI.
  ipcMain.handle('agent:usage', () => usage);
}
