/**
 * Renderer entry point, loaded by Vite in the Electron "renderer" context.
 * Node.js integration is disabled here; see https://electronjs.org/docs/tutorial/security
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

document.documentElement.dataset.theme =
  localStorage.getItem('theme') ?? 'dark';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
