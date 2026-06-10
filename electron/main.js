'use strict';

const { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');

// Reliable packaged-vs-dev detection (never use electron-is-dev for this)
const isPacked = app.isPackaged;

let mainWindow = null;
let tray = null;
let backendProcess = null;

// ── Backend daemon ─────────────────────────────────────────────────────────
function startBackend() {
  const serverPath = isPacked
    ? path.join(process.resourcesPath, 'server', 'index.js')
    : path.join(__dirname, '..', 'server', 'index.js');

  console.log('[electron] Starting backend:', serverPath);

  backendProcess = fork(serverPath, [], {
    env: { ...process.env, ELECTRON: '1', RESOURCES_PATH: process.resourcesPath },
    execArgv: [],
    silent: true,
  });

  backendProcess.stdout?.on('data', d => process.stdout.write('[server] ' + d));
  backendProcess.stderr?.on('data', d => process.stderr.write('[server] ' + d));
  backendProcess.on('exit', code => {
    console.log('[electron] Backend exited, code', code);
    backendProcess = null;
  });
}

function stopBackend() {
  if (!backendProcess) return;
  try {
    if (process.platform === 'win32') {
      require('child_process').execSync(`taskkill /PID ${backendProcess.pid} /F /T`, { stdio: 'ignore' });
    } else {
      require('child_process').execSync(`sudo kill ${backendProcess.pid} 2>/dev/null || kill ${backendProcess.pid} 2>/dev/null`);
    }
  } catch { backendProcess.kill('SIGTERM'); }
  backendProcess = null;
}

// ── Wait for backend ────────────────────────────────────────────────────────
function waitForBackend(retries = 30, delayMs = 300) {
  return new Promise(resolve => {
    let n = 0;
    function try_() {
      const req = http.get('http://127.0.0.1:3001/api/health', { timeout: 400 }, res => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => { if (++n < retries) setTimeout(try_, delayMs); else resolve(false); });
      req.on('timeout', () => { req.destroy(); if (++n < retries) setTimeout(try_, delayMs); else resolve(false); });
    }
    try_();
  });
}

// ── Main window ─────────────────────────────────────────────────────────────
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
      // Allow localhost WebSocket from file:// pages
      webSecurity: false,
    },
  });

  Menu.setApplicationMenu(null);

  if (isPacked) {
    // Production: load the bundled React app from disk
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  } else {
    // Development only: hot-reload from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', e => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });
}

// ── System tray ──────────────────────────────────────────────────────────────
function createTray() {
  // Minimal 1×1 transparent PNG so tray works without an icon file
  const icon = nativeImage.createEmpty();
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

// ── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));

// ── Lifecycle ────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  startBackend();
  createTray();

  const ready = await waitForBackend();
  if (!ready) console.warn('[electron] Backend not ready — opening window anyway');

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
