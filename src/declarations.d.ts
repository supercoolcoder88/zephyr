/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
/// <reference types="vite/client" />
declare module '*.css';

interface Window {
  agent: import('./agent-types').AgentApi;
  backlog: import('./agent-types').BacklogApi;
  update: import('./agent-types').UpdateApi;
  terminal: import('./agent-types').TerminalApi;
}
