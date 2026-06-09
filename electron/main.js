'use strict';

const { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');
const isDev = require('electron-is-dev');

let mainWindow = null;
let tray = null;
let backendProcess = null;

// ── Backend daemon ─────────────────────────────────────────────────────────
function startBackend() {
  // In packaged app, server lives in extraResources; in dev, use local path
  const serverPath = isDev
    ? path.join(__dirname, '../server/index.js')
    : path.join(process.resourcesPath, 'server/index.js');

  console.log('[electron] Starting backend:', serverPath);

  // Use execArgv: [] to avoid passing --inspect flags to the child
  backendProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      ELECTRON: '1',
      // Make sure node can resolve modules from the app root (not extraResources)
      NODE_PATH: isDev
        ? path.join(__dirname, '../node_modules')
        : path.join(process.resourcesPath, '../app/node_modules'),
    },
    execArgv: [],
    silent: true,
  });

  backendProcess.stdout?.on('data', d => console.log('[server]', d.toString().trim()));
  backendProcess.stderr?.on('data', d => console.error('[server]', d.toString().trim()));
  backendProcess.on('exit', code => {
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

// ── Wait for backend to be ready ───────────────────────────────────────────
function waitForBackend(maxRetries = 20, delay = 300) {
  return new Promise((resolve) => {
    let tries = 0;
    function attempt() {
      const req = http.get('http://localhost:3001/api/health', (res) => {
        if (res.statusCode === 200) { resolve(true); return; }
        retry();
      });
      req.on('error', retry);
      req.setTimeout(500, () => { req.destroy(); retry(); });
    }
    function retry() {
      if (++tries >= maxRetries) { resolve(false); return; }
      setTimeout(attempt, delay);
    }
    attempt();
  });
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

  Menu.setApplicationMenu(null);

  const devURL = 'http://localhost:5173';
  const prodFile = path.join(__dirname, '../dist/index.html');

  if (isDev) {
    mainWindow.loadURL(devURL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(prodFile);
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ── System tray ────────────────────────────────────────────────────────────
function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA' +
    'AAABJRU5ErkJggg=='
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
app.whenReady().then(async () => {
  startBackend();
  createTray();

  // Wait for backend to be ready before opening the window (max ~6 seconds)
  const ready = await waitForBackend();
  if (!ready) console.warn('[electron] Backend did not respond in time — opening anyway');

  createWindow();
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
