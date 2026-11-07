// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AgentApi, AgentEvent } from './agent-types';

const agent: AgentApi = {
  run: (runId, prompt, cwd, resume) =>
    ipcRenderer.invoke('agent:run', runId, prompt, cwd, resume),
  pickWorkspace: () => ipcRenderer.invoke('workspace:pick'),
  cancel: (runId) => ipcRenderer.invoke('agent:cancel', runId),
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
