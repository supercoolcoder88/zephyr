// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AgentApi, AgentEvent } from './agent-types';

const agent: AgentApi = {
  run: (prompt, resume) => ipcRenderer.invoke('agent:run', prompt, resume),
  cancel: () => ipcRenderer.invoke('agent:cancel'),
  onEvent: (listener) => {
    const handler = (_: IpcRendererEvent, event: AgentEvent) => listener(event);
    ipcRenderer.on('agent:event', handler);
    return () => ipcRenderer.off('agent:event', handler);
  },
};

contextBridge.exposeInMainWorld('agent', agent);
