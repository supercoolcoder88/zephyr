// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AgentApi, AgentEvent } from './agent-types';

const agent: AgentApi = {
  run: (runId, prompt, cwd, resume, choice) =>
    ipcRenderer.invoke('agent:run', runId, prompt, cwd, resume, choice),
  pickWorkspace: () => ipcRenderer.invoke('workspace:pick'),
  catalog: (cwd) => ipcRenderer.invoke('agent:catalog', cwd),
  cancel: (runId) => ipcRenderer.invoke('agent:cancel', runId),
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
