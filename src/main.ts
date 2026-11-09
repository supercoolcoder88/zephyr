import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { registerAgentIpc } from './agent';
import { registerTodoIpc } from './todos';

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
  // Create the browser window.
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

  // and load the index.html of the app.
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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // The default menu carries Chromium's zoom, reload and devtools accelerators.
  Menu.setApplicationMenu(null);
  registerAgentIpc();
  registerTodoIpc();
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
