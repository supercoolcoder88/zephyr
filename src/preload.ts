// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AgentApi, AgentEvent } from './agent-types';

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
  answerPermission: (runId, id, allow) =>
    ipcRenderer.invoke('agent:permission-answer', runId, id, allow),
  pickWorkspace: () => ipcRenderer.invoke('workspace:pick'),
  paths: (cwd, candidates) =>
    ipcRenderer.invoke('workspace:paths', cwd, candidates),
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
};

contextBridge.exposeInMainWorld('agent', agent);
