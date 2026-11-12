import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { loadCatalog, registerAgentIpc } from './agent';
import { registerBacklogIpc } from './backlog';
import { registerTerminalIpc } from './terminal';
import { registerUpdateIpc } from './update';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// `zephyr <dir>` passes the folder to open; dev runs carry the app path first.
const launchDir = process.argv
  .slice(app.isPackaged ? 1 : 2)
  .find((arg) => !arg.startsWith('-'));
const query = launchDir ? { workspace: path.resolve(launchDir) } : undefined;

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // A dropped file or plain link would otherwise replace the app; reloads of the current URL pass.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(
      `${MAIN_WINDOW_VITE_DEV_SERVER_URL}?${new URLSearchParams(query)}`,
    );
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      { query },
    );
  }

  // Pinch and ctrl+wheel zoom bypass the menu, so clamp them here.
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
  mainWindow.webContents.on('zoom-changed', () =>
    mainWindow.webContents.setZoomLevel(0),
  );
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!app.isPackaged && input.type === 'keyDown' && input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
};

app.whenReady().then(() => {
  // The default menu carries Chromium's zoom, reload and devtools accelerators.
  Menu.setApplicationMenu(null);
  registerAgentIpc();
  loadCatalog().catch(() => {});
  registerBacklogIpc();
  registerUpdateIpc();
  registerTerminalIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
