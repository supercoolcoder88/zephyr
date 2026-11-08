import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type WebContents,
} from 'electron';
import path from 'node:path';
import type {
  Options,
  SDKAssistantMessage,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentEvent,
  Effort,
  Model,
  ModelChoice,
  Output,
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
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
  };
}

// Keyed by a renderer-chosen run id so each thread can cancel its own run.
const runs = new Map<string, AbortController>();

function send(target: WebContents, runId: string, event: AgentEvent) {
  if (!target.isDestroyed()) target.send('agent:event', runId, event);
}

type AssistantContent = SDKAssistantMessage['message']['content'];

function blockEvents(content: AssistantContent) {
  return content.flatMap((block): Output[] =>
    block.type === 'text'
      ? [{ type: 'text', text: block.text }]
      : block.type === 'tool_use'
        ? [{ type: 'tool', name: block.name, input: block.input }]
        : [],
  );
}

function forward(target: WebContents, runId: string, message: SDKMessage) {
  switch (message.type) {
    case 'system':
      if (message.subtype === 'init') {
        send(target, runId, { type: 'session', sessionId: message.session_id });
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
    'agent:run',
    async (
      ipcEvent,
      runId: string,
      prompt: string,
      cwd: string,
      resume: string | undefined,
      { model, effort }: ModelChoice,
    ) => {
      const target = ipcEvent.sender;
      const abortController = new AbortController();
      runs.set(runId, abortController);
      const abort = () => abortController.abort();
      target.once('destroyed', abort);

      try {
        const { query } = await loadSdk();
        for await (const message of query({
          prompt,
          options: { ...options(cwd), abortController, resume, model, effort },
        })) {
          forward(target, runId, message);
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          send(target, runId, {
            type: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        runs.delete(runId);
        target.off('destroyed', abort);
      }
    },
  );

  ipcMain.handle('workspace:pick', async (ipcEvent) => {
    const { filePaths } = await dialog.showOpenDialog(
      BrowserWindow.fromWebContents(ipcEvent.sender)!,
      { properties: ['openDirectory'] },
    );
    return filePaths[0];
  });

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
          content: string | { type: string; text?: string }[];
        };
        const texts =
          typeof content === 'string'
            ? [content]
            : content.flatMap((b) => (b.type === 'text' ? [b.text] : []));
        if (texts.length) items.push({ type: 'user', text: texts.join('\n') });
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

  ipcMain.handle('agent:cancel', (_, runId: string) => {
    runs.get(runId)?.abort();
  });
}
