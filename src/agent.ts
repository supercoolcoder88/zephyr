import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type WebContents,
} from 'electron';
import { stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
  };
}

const mode = (permission: Permission) =>
  permission === 'auto' ? 'bypassPermissions' : 'default';

const IDLE_MS = 10 * 60_000;
const MAX_SESSIONS = 4;

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
    answers: Map<string, (allow: boolean) => void>;
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

function sendPicked(
  target: WebContents,
  runId: string,
  {
    user_message_uuid,
    user_message_uuids,
  }: { user_message_uuid?: string; user_message_uuids?: string[] },
) {
  const ids =
    user_message_uuids ?? (user_message_uuid ? [user_message_uuid] : []);
  if (ids.length) send(target, runId, { type: 'picked', ids });
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
      if (!id) sendPicked(target, runId, message);
      for (const output of blockEvents(message.message.content)) {
        send(
          target,
          runId,
          id ? { type: 'subthread-output', id, output } : output,
        );
      }
      break;
    }
    case 'result':
      sendPicked(target, runId, message);
      send(target, runId, {
        type: 'done',
        ok: message.subtype === 'success' && !message.is_error,
        result:
          message.subtype === 'success' ? message.result : message.subtype,
      });
      break;
  }
}

// Skills and usage only come from a live CLI, so start one that never gets a prompt.
async function idleQuery(cwd: string) {
  const { query } = await loadSdk();
  return query({
    prompt: {
      [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }),
    } as AsyncIterable<SDKUserMessage>,
    options: options(cwd),
  });
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
      const answers = new Map<string, (allow: boolean) => void>();
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
          permissionMode: mode(permission),
          canUseTool: (tool, input, { signal, requestId, title }) =>
            new Promise((resolve) => {
              session.busy();
              answers.set(requestId, (allow) => {
                if (!answers.delete(requestId)) return;
                send(target, runId, { type: 'permission-end', id: requestId });
                resolve(
                  allow
                    ? { behavior: 'allow', updatedInput: input }
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
                request: { id: requestId, tool, input, title },
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
          await q.setPermissionMode(mode(next));
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
      target.once('destroyed', session.close);
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
          target.off('destroyed', session.close);
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
    (_, runId: string, id: string, allow: boolean) => {
      sessions.get(runId)?.answers.get(id)?.(allow);
    },
  );

  ipcMain.handle('workspace:pick', async (ipcEvent) => {
    const { filePaths } = await dialog.showOpenDialog(
      BrowserWindow.fromWebContents(ipcEvent.sender)!,
      { properties: ['openDirectory'] },
    );
    return filePaths[0];
  });

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
        updatedAt: s.lastModified,
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
                source?: {
                  type: string;
                  media_type: Image['mediaType'];
                  data: string;
                };
              }[];
        };
        const blocks = typeof content === 'string' ? [] : content;
        const texts =
          typeof content === 'string'
            ? [content]
            : blocks.flatMap((b) => (b.type === 'text' ? [b.text!] : []));
        const images = blocks.flatMap((b): Image[] =>
          b.type === 'image' && b.source?.type === 'base64'
            ? [{ mediaType: b.source.media_type, data: b.source.data }]
            : [],
        );
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
    async (_, sessionId: string, cwd: string) => {
      const { deleteSession } = await loadSdk();
      // Already gone (or a retry after a partial delete) counts as deleted.
      await deleteSession(sessionId, { dir: cwd }).catch((err: unknown) => {
        if (!(err instanceof Error && /not found/i.test(err.message))) {
          throw err;
        }
      });
    },
  );

  ipcMain.handle(
    'agent:catalog',
    async (
      _,
      cwd: string,
    ): Promise<{ commands: SlashCommand[]; models: Model[] }> => {
      const idle = await idleQuery(cwd);
      try {
        const [{ skills }, models] = await Promise.all([
          idle.reloadSkills(),
          idle.supportedModels(),
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
        return {
          commands: skills
            .map(({ name, description, argumentHint }) => ({
              name,
              description,
              argumentHint,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          models: families,
        };
      } finally {
        idle.close();
      }
    },
  );

  ipcMain.handle(
    'agent:usage',
    async (_, cwd: string): Promise<UsageWindow[] | null> => {
      const idle = await idleQuery(cwd);
      try {
        const { rate_limits } =
          await idle.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
            skipBehaviors: true,
          });
        if (!rate_limits) return null;
        return [
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
        );
      } finally {
        idle.close();
      }
    },
  );
}
