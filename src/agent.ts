import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type WebContents,
} from 'electron';
import path from 'node:path';
import type {
  SDKAssistantMessage,
  SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent, ThreadItem } from './agent-types';

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

// Keyed by a renderer-chosen run id so each thread can cancel its own run.
const runs = new Map<string, AbortController>();

function send(target: WebContents, runId: string, event: AgentEvent) {
  if (!target.isDestroyed()) target.send('agent:event', runId, event);
}

type AssistantContent = SDKAssistantMessage['message']['content'];

function blockEvents(content: AssistantContent) {
  return content.flatMap(
    (block): Extract<AgentEvent, { type: 'text' | 'tool' }>[] =>
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
      }
      break;
    case 'assistant':
      for (const event of blockEvents(message.message.content)) {
        send(target, runId, event);
      }
      break;
    case 'result': {
      const usage = Object.values(message.modelUsage);
      send(target, runId, {
        type: 'done',
        ok: message.subtype === 'success' && !message.is_error,
        result:
          message.subtype === 'success' ? message.result : message.subtype,
        costUsd: message.total_cost_usd,
        inputTokens: usage.reduce(
          (n, u) =>
            n +
            u.inputTokens +
            u.cacheReadInputTokens +
            u.cacheCreationInputTokens,
          0,
        ),
        outputTokens: usage.reduce((n, u) => n + u.outputTokens, 0),
      });
      break;
    }
  }
}

export function registerAgentIpc() {
  ipcMain.handle(
    'agent:run',
    async (
      ipcEvent,
      runId: string,
      prompt: string,
      cwd: string,
      resume?: string,
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
          options: {
            abortController,
            resume,
            pathToClaudeCodeExecutable: packagedClaudeBinary(),
            model: 'claude-opus-5-5',
            cwd,
            tools: { type: 'preset', preset: 'claude_code' },
            systemPrompt: { type: 'preset', preset: 'claude_code' },
            settingSources: ['user', 'project', 'local'],
            skills: 'all',
            permissionMode: 'bypassPermissions',
            allowDangerouslySkipPermissions: true,
          },
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

  ipcMain.handle('agent:cancel', (_, runId: string) => {
    runs.get(runId)?.abort();
  });
}
