import { app, ipcMain, type WebContents } from 'electron';
import path from 'node:path';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent } from './agent-types';

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

// One in-flight run per window, so a window can cancel its own run.
const runs = new Map<number, AbortController>();

function send(target: WebContents, event: AgentEvent) {
  if (!target.isDestroyed()) target.send('agent:event', event);
}

function forward(target: WebContents, message: SDKMessage) {
  switch (message.type) {
    case 'system':
      if (message.subtype === 'init') {
        send(target, { type: 'session', sessionId: message.session_id });
      }
      break;
    case 'assistant':
      for (const block of message.message.content) {
        if (block.type === 'text') {
          send(target, { type: 'text', text: block.text });
        } else if (block.type === 'tool_use') {
          send(target, { type: 'tool', name: block.name, input: block.input });
        }
      }
      break;
    case 'result':
      send(target, {
        type: 'done',
        ok: message.subtype === 'success' && !message.is_error,
        result:
          message.subtype === 'success' ? message.result : message.subtype,
        costUsd: message.total_cost_usd,
      });
      break;
  }
}

export function registerAgentIpc() {
  ipcMain.handle(
    'agent:run',
    async (ipcEvent, prompt: string, resume?: string) => {
      const target = ipcEvent.sender;
      runs.get(target.id)?.abort();
      const abortController = new AbortController();
      runs.set(target.id, abortController);

      try {
        const { query } = await loadSdk();
        for await (const message of query({
          prompt,
          options: {
            abortController,
            resume,
            pathToClaudeCodeExecutable: packagedClaudeBinary(),
            model: 'claude-opus-5-5',
            cwd: process.cwd(),
            // Read-only by default: anything outside this list is denied
            // without prompting. Widen this deliberately.
            allowedTools: ['Read', 'Glob', 'Grep'],
            permissionMode: 'dontAsk',
          },
        })) {
          forward(target, message);
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          send(target, {
            type: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        if (runs.get(target.id) === abortController) runs.delete(target.id);
      }
    },
  );

  ipcMain.handle('agent:cancel', (ipcEvent) => {
    runs.get(ipcEvent.sender.id)?.abort();
  });
}
