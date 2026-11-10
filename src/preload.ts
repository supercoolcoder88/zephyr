// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  AgentApi,
  AgentEvent,
  BacklogEntry,
  BacklogApi,
  TerminalApi,
  UpdateApi,
} from './agent-types';

const agent: AgentApi = {
  send: (runId, prompt, images, cwd, resume, choice, permission, uuid) =>
    ipcRenderer.invoke(
      'agent:send',
      runId,
      prompt,
      images,
      cwd,
      resume,
      choice,
      permission,
      uuid,
    ),
  setPermission: (runId, permission) =>
    ipcRenderer.invoke('agent:set-permission', runId, permission),
  answerPermission: (runId, id, allow, answers) =>
    ipcRenderer.invoke('agent:permission-answer', runId, id, allow, answers),
  pickWorkspace: () => ipcRenderer.invoke('workspace:pick'),
  paths: (cwd, candidates) =>
    ipcRenderer.invoke('workspace:paths', cwd, candidates),
  complete: (cwd, partial) =>
    ipcRenderer.invoke('workspace:complete', cwd, partial),
  catalog: (cwd) => ipcRenderer.invoke('agent:catalog', cwd),
  interrupt: (runId) => ipcRenderer.invoke('agent:interrupt', runId),
  close: (runId) => ipcRenderer.invoke('agent:close', runId),
  usage: () => ipcRenderer.invoke('agent:usage'),
  listThreads: (cwd) => ipcRenderer.invoke('threads:list', cwd),
  loadThread: (sessionId, cwd) =>
    ipcRenderer.invoke('threads:load', sessionId, cwd),
  deleteThread: (sessionId, cwd, worktree) =>
    ipcRenderer.invoke('threads:delete', sessionId, cwd, worktree),
  branch: (cwd) => ipcRenderer.invoke('git:branch', cwd),
  createWorktree: (cwd, name, setup) =>
    ipcRenderer.invoke('git:worktree', cwd, name, setup),
  setupCommand: (cwd) => ipcRenderer.invoke('git:setup', cwd),
  mergeWorktree: (cwd, worktree, message) =>
    ipcRenderer.invoke('git:merge', cwd, worktree, message),
  onEvent: (listener) => {
    const handler = (_: IpcRendererEvent, runId: string, event: AgentEvent) =>
      listener(runId, event);
    ipcRenderer.on('agent:event', handler);
    return () => ipcRenderer.off('agent:event', handler);
  },
  onCatalogChange: (listener) => {
    const handler = (_: IpcRendererEvent, cwd: string) => listener(cwd);
    ipcRenderer.on('agent:catalog-change', handler);
    return () => ipcRenderer.off('agent:catalog-change', handler);
  },
};

const entries: BacklogApi = {
  watch: (cwd) => ipcRenderer.invoke('backlog:watch', cwd),
  edit: (cwd, edit) => ipcRenderer.invoke('backlog:edit', cwd, edit),
  onChange: (listener) => {
    const handler = (_: IpcRendererEvent, cwd: string, list: BacklogEntry[]) =>
      listener(cwd, list);
    ipcRenderer.on('backlog:change', handler);
    return () => ipcRenderer.off('backlog:change', handler);
  },
};

contextBridge.exposeInMainWorld('agent', agent);
contextBridge.exposeInMainWorld('backlog', entries);
contextBridge.exposeInMainWorld('update', {
  check: () => ipcRenderer.invoke('update:check'),
  install: (workspace) => ipcRenderer.invoke('update:install', workspace),
} satisfies UpdateApi);
contextBridge.exposeInMainWorld('terminal', {
  open: (cwd, cols, rows) =>
    ipcRenderer.invoke('terminal:open', cwd, cols, rows),
  write: (cwd, data) => ipcRenderer.send('terminal:write', cwd, data),
  resize: (cwd, cols, rows) =>
    ipcRenderer.send('terminal:resize', cwd, cols, rows),
  close: (cwd) => ipcRenderer.send('terminal:close', cwd),
  onData: (listener) => {
    const handler = (_: IpcRendererEvent, cwd: string, data: string) =>
      listener(cwd, data);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.off('terminal:data', handler);
  },
  onExit: (listener) => {
    const handler = (_: IpcRendererEvent, cwd: string) => listener(cwd);
    ipcRenderer.on('terminal:exit', handler);
    return () => ipcRenderer.off('terminal:exit', handler);
  },
} satisfies TerminalApi);
