// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  AgentApi,
  AgentEvent,
  Todo,
  TodoApi,
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
  usage: (cwd) => ipcRenderer.invoke('agent:usage', cwd),
  listThreads: (cwd) => ipcRenderer.invoke('threads:list', cwd),
  loadThread: (sessionId, cwd) =>
    ipcRenderer.invoke('threads:load', sessionId, cwd),
  deleteThread: (sessionId, cwd) =>
    ipcRenderer.invoke('threads:delete', sessionId, cwd),
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

const todos: TodoApi = {
  watch: (cwd) => ipcRenderer.invoke('todos:watch', cwd),
  edit: (cwd, edit) => ipcRenderer.invoke('todos:edit', cwd, edit),
  onChange: (listener) => {
    const handler = (_: IpcRendererEvent, cwd: string, list: Todo[]) =>
      listener(cwd, list);
    ipcRenderer.on('todos:change', handler);
    return () => ipcRenderer.off('todos:change', handler);
  },
};

contextBridge.exposeInMainWorld('agent', agent);
contextBridge.exposeInMainWorld('todos', todos);
contextBridge.exposeInMainWorld('update', {
  check: () => ipcRenderer.invoke('update:check'),
  install: () => ipcRenderer.invoke('update:install'),
} satisfies UpdateApi);
