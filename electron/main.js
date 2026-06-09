'use strict';

const { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const isDev = require('electron-is-dev');

let mainWindow = null;
let tray = null;
let backendProcess = null;

// ── Backend daemon ─────────────────────────────────────────────────────────
function startBackend() {
  const serverPath = isDev
    ? path.join(__dirname, '../server/index.js')
    : path.join(process.resourcesPath, 'server/index.js');

  console.log('[electron] Starting backend:', serverPath);

  backendProcess = fork(serverPath, [], {
    env: { ...process.env, ELECTRON: '1' },
    silent: true,
  });

  backendProcess.stdout?.on('data', d => console.log('[server]', d.toString().trim()));
  backendProcess.stderr?.on('data', d => console.error('[server]', d.toString().trim()));

  backendProcess.on('exit', (code) => {
    console.log('[electron] Backend exited with code', code);
    backendProcess = null;
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

// ── Main window ────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#0E1A35',
    title: 'SurfVPN',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Remove default menu bar
  Menu.setApplicationMenu(null);

  const devURL = 'http://localhost:5173';
  const prodFile = path.join(__dirname, '../dist/index.html');

  if (isDev) {
    mainWindow.loadURL(devURL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(prodFile);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    // Minimise to tray instead of quitting
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ── System tray ────────────────────────────────────────────────────────────
function createTray() {
  // 16×16 teal shield icon encoded inline
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA' +
    'AXNSRQIBDllI2pAAAAFJSURBVDiNlZM9SwNBEIbf3V1yiQiCKCiIYGNhYSGChYiIiBDQ' +
    'g4CgoKAgCCIIgoigICgICgqCgqAgKCgICoKCoCAoCAqCgqCgICgICoKCoCAoCAqCgqCg' +
    'ICgICoKCoCAoCAqCgqAgKAhqA/4HAAD//wMAUEsBAi0AFAAGAAgAAAAhAA=='
  );

  tray = new Tray(icon);
  tray.setToolTip('SurfVPN');

  const menu = Menu.buildFromTemplate([
    { label: 'Show SurfVPN', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => mainWindow?.show());
}

// ── IPC handlers ───────────────────────────────────────────────────────────
ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));

// ── App lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Give backend a moment to start before renderer connects
  startBackend();
  setTimeout(createWindow, 1200);
  createTray();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopBackend();
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
  else mainWindow.show();
});
