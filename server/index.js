'use strict';

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const si = require('systeminformation');
const { getServers } = require('./vpngate');
const { disconnect, isRunning, setExitCallback, getPublicIP } = require('./openvpn');
const { connectUSA, ONLY_USA } = require('./vpn/openvpnManager');
const { getUSAServers } = require('./vpn/providers/vpngateProvider');
const { execSync } = require('child_process');

const PORT = 3001;

// ── App setup ──────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const httpServer = http.createServer(app);
const wss = new WebSocket.Server({ server: httpServer });

// ── OpenVPN availability check ─────────────────────────────────────────────
const isWindows = process.platform === 'win32';

function findOpenVPN() {
  const fs = require('fs');
  const path = require('path');

  // Check bundled binary first — shipped with the Electron app via extraResources
  const resourcesPath = process.env.RESOURCES_PATH;
  if (resourcesPath) {
    const bundledExe = path.join(resourcesPath, 'win', 'openvpn.exe');
    try { fs.accessSync(bundledExe); return bundledExe; } catch { /* not present */ }
  }

  // Check common Windows system install paths
  if (isWindows) {
    const candidates = [
      'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe',
      'C:\\Program Files (x86)\\OpenVPN\\bin\\openvpn.exe',
    ];
    for (const p of candidates) {
      try { fs.accessSync(p); return p; } catch { /* try next */ }
    }
    try {
      const out = execSync('where openvpn', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      return out.split(/\r?\n/)[0] || null;
    } catch { return null; }
  }
  try {
    const out = execSync('which openvpn', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return out || null;
  } catch { return null; }
}

const openvpnPath = findOpenVPN();
const openvpnAvailable = Boolean(openvpnPath);

const installHint = isWindows
  ? 'Download from https://openvpn.net/community-downloads/'
  : 'sudo apt-get install openvpn';
console.log(`OpenVPN: ${openvpnAvailable ? openvpnPath : `NOT FOUND — ${installHint}`}`);
console.log(`USA-only mode: ${ONLY_USA}`);


// ── REST endpoints ─────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, openvpnAvailable, onlyUSA: ONLY_USA }));

app.get('/api/ip', async (_req, res) => {
  const ip = await getPublicIP();
  res.json({ ip: ip ?? 'unknown' });
});

// /api/servers returns USA-only servers when ONLY_USA=true
app.get('/api/servers', async (_req, res) => {
  try {
    const servers = ONLY_USA ? await getUSAServers() : await getServers();
    res.json({ servers, count: servers.length, cached: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Speed monitoring ───────────────────────────────────────────────────────
let prevNetStats = null;

async function measureSpeed() {
  try {
    const stats = await si.networkStats();
    if (!stats.length) return { download: 0, upload: 0 };
    const curr = stats[0];
    if (!prevNetStats) { prevNetStats = curr; return { download: 0, upload: 0 }; }
    const elapsed = (curr.ms - (prevNetStats.ms || 0)) / 1000 || 1;
    const dl = Math.max(0, (curr.rx_bytes - prevNetStats.rx_bytes) * 8 / 1e6 / elapsed);
    const ul = Math.max(0, (curr.tx_bytes - prevNetStats.tx_bytes) * 8 / 1e6 / elapsed);
    prevNetStats = curr;
    return { download: Math.round(dl * 100) / 100, upload: Math.round(ul * 100) / 100 };
  } catch {
    return { download: 0, upload: 0 };
  }
}

// ── WebSocket handling ─────────────────────────────────────────────────────
function send(ws, type, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}

wss.on('connection', async (ws) => {
  console.log('[ws] Client connected');

  let speedTimer = null;
  let totalDown = 0;
  let totalUp = 0;

  function startSpeedMonitor() {
    speedTimer = setInterval(async () => {
      const speed = await measureSpeed();
      totalDown += speed.download / 10;
      totalUp += speed.upload / 10;
      send(ws, 'speed', { ...speed, totalDownload: totalDown, totalUpload: totalUp });
    }, 1000);
  }

  function stopSpeedMonitor() {
    if (speedTimer) { clearInterval(speedTimer); speedTimer = null; }
    totalDown = 0;
    totalUp = 0;
  }

  // Send initial state
  const realIP = await getPublicIP();
  send(ws, 'init', {
    openvpnAvailable,
    realIP: realIP ?? 'unknown',
    connected: isRunning(),
    onlyUSA: ONLY_USA,
  });

  // Handle unexpected VPN exit
  setExitCallback(() => {
    stopSpeedMonitor();
    getPublicIP().then(ip => {
      send(ws, 'status', { status: 'disconnected', realIP: ip ?? 'unknown' });
    });
  });

  // Connection state: prevents parallel retry loops and lets disconnect abort an in-flight attempt.
  // Connection state for this client: prevents parallel retry loops when the
  // user double-clicks connect, and lets a disconnect request abort a retry
  // loop that is still walking the server list.
  let connectBusy = false;
  let connectAborted = false;

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // ── connect ──
    if (msg.type === 'connect') {
      const server = msg.data;
      if (!openvpnAvailable) {
        send(ws, 'error', `OpenVPN not found. ${installHint}`);
        return;
      }
      if (!server?.config) {
        send(ws, 'error', 'No VPN config for selected server');
        return;
      }
      if (connectBusy) {
        send(ws, 'log', 'A connection attempt is already in progress.');
        return;
      }
      connectBusy = true;
      connectAborted = false;

      try {
        const connected = await connectUSA(
          server,
          (type, data) => send(ws, type, data),
          () => connectAborted,
        );
        if (connected && !connectAborted) {
          startSpeedMonitor();

      send(ws, 'status', { status: 'connecting', server });

      // Try up to 5 servers: the requested one first, then next-best by score
      const MAX_ATTEMPTS = 5;
      let lastErr = null;
      let tried = 0;

      try {
        const allServers = await getServers().catch(() => []);
        const startIdx = allServers.findIndex(s => s.id === server.id);
        // Build candidate list: requested server first, then subsequent by score
        const candidates = startIdx >= 0
          ? [allServers[startIdx], ...allServers.slice(startIdx + 1)]
          : [server];

        for (const candidate of candidates) {
          if (connectAborted || tried >= MAX_ATTEMPTS) break;
          if (!candidate?.config) continue;
          tried++;

          if (tried > 1) {
            send(ws, 'log', `Trying next server: ${candidate.country} (${candidate.ip}) [attempt ${tried}/${MAX_ATTEMPTS}]`);
            send(ws, 'status', { status: 'connecting', server: candidate });
          }

          try {
            const result = await connect(candidate, (log) => send(ws, 'log', log));
            if (connectAborted) { await disconnect(); break; }
            const vpnIP = result.ip ?? candidate.ip;
            send(ws, 'status', { status: 'connected', server: candidate, vpnIP });
            startSpeedMonitor();
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            console.error(`[openvpn] attempt ${tried} failed (${candidate.ip}): ${err.message}`);
            send(ws, 'log', `Failed: ${err.message}`);
          }
        }

        if (connectAborted) {
          const ip = await getPublicIP();
          send(ws, 'status', { status: 'disconnected', realIP: ip ?? 'unknown' });
        } else if (lastErr) {
          send(ws, 'error', `All ${tried} servers failed. Last error: ${lastErr.message}`);
          const ip = await getPublicIP();
          send(ws, 'status', { status: 'disconnected', realIP: ip ?? 'unknown' });
        }
      } catch (outerErr) {
        send(ws, 'error', outerErr.message);
        const ip = await getPublicIP();
        send(ws, 'status', { status: 'disconnected', realIP: ip ?? 'unknown' });
      } finally {
        connectBusy = false;
      }
      return;
    }

    // ── disconnect ──
    if (msg.type === 'disconnect') {
      connectAborted = true; // abort any in-flight retry loop
      connectAborted = true; // stop any in-flight retry loop
      stopSpeedMonitor();
      send(ws, 'status', { status: 'disconnecting' });
      await disconnect();
      const ip = await getPublicIP();
      send(ws, 'status', { status: 'disconnected', realIP: ip ?? 'unknown' });
      return;
    }
  });

  ws.on('close', () => {
    console.log('[ws] Client disconnected');
    stopSpeedMonitor();
  });
});

// ── Start ──────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\nSurfVPN backend listening on http://localhost:${PORT}`);
  console.log('Endpoints: GET /api/ip  GET /api/servers  GET /api/health');
  console.log('WebSocket: ws://localhost:3001\n');

  // Pre-warm the server cache in background
  const prewarm = ONLY_USA ? getUSAServers : getServers;
  prewarm().then(s => console.log(`[vpngate] Cached ${s.length} servers (USA-only: ${ONLY_USA})`)).catch(console.error);
});
